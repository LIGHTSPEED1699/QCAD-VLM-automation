#!/usr/bin/env python3
"""
VLM Client: Unified interface to local Ollama vision models.

Handles:
  - Image encoding (PNG/JPG → base64)
  - Prompt templating per model
  - JSON extraction from markdown-wrapped responses
  - Retry with backoff
  - VRAM-aware model selection

Models supported:
  - qwen2.5vl:latest       (primary, ~6GB VRAM, native JSON)
  - gemma4:e4b             (instruction parsing, ~9.6GB VRAM)
  - glm-ocr:latest         (OCR specialist, ~3-4GB VRAM)
  - qwen3.5:9b             (fast text-only fallback)
  - llava:latest           (legacy vision fallback)
"""

import os
import re
import json
import base64
import time
import requests
from pathlib import Path
from typing import Optional, Dict, Any, Union, List
from dataclasses import dataclass, asdict
from PIL import Image
import io


@dataclass
class VLMResponse:
    """Structured response from a VLM call."""
    raw_text: str
    parsed_json: Optional[Dict[str, Any]] = None
    model_used: str = ""
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    latency_ms: float = 0.0
    confidence: Optional[float] = None
    error: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class VLMClient:
    """Unified client for local Ollama vision models."""

    OLLAMA_URL = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
    DEFAULT_TIMEOUT = 120
    MAX_RETRIES = 3
    RETRY_DELAY = 2.0

    # Model metadata: (name, vram_gb, supports_vision, json_native)
    MODEL_REGISTRY = {
        "qwen2.5vl:latest":     {"vram_gb": 6.0,  "vision": True,  "json_native": True},
        "gemma4:e4b":           {"vram_gb": 9.6,  "vision": True,  "json_native": False},
        "qwen3.5:9b":           {"vram_gb": 6.6,  "vision": False, "json_native": True},
        "glm-ocr:latest":       {"vram_gb": 3.5,  "vision": True,  "json_native": False},
        "llava:latest":         {"vram_gb": 4.7,  "vision": True,  "json_native": False},
    }

    def __init__(self, model: str = "qwen2.5vl:latest", temperature: float = 0.2):
        self.model = model
        self.temperature = temperature
        self.session = requests.Session()

    @classmethod
    def auto_select(cls, task: str, available_vram_gb: float = 12.0) -> str:
        """
        Pick best model for task given VRAM budget.

        task: "vision", "ocr", "json", "fast", "instruction_parse"
        """
        candidates = []
        for name, meta in cls.MODEL_REGISTRY.items():
            if meta["vram_gb"] <= available_vram_gb * 0.85:  # leave headroom
                candidates.append((name, meta))

        if task == "ocr":
            candidates.sort(key=lambda x: (not x[1]["vision"], x[1]["vram_gb"]))
            for name, meta in candidates:
                if meta["vision"]:
                    return name
            return "qwen2.5vl:latest"

        if task == "instruction_parse":
            # gemma4:e4b is good at structured output from text
            for name, meta in candidates:
                if "gemma4" in name:
                    return name
            return "qwen2.5vl:latest"

        if task == "json":
            candidates.sort(key=lambda x: (not x[1]["json_native"], x[1]["vram_gb"]))
            return candidates[0][0] if candidates else "qwen2.5vl:latest"

        # default vision
        candidates.sort(key=lambda x: (not x[1]["vision"], -x[1]["vram_gb"]))
        return candidates[0][0] if candidates else "qwen2.5vl:latest"

    @staticmethod
    def encode_image(image: Union[str, Path, Image.Image]) -> str:
        """Convert image to base64 PNG string for Ollama vision API."""
        if isinstance(image, (str, Path)):
            path = Path(image)
            if not path.exists():
                raise FileNotFoundError(f"Image not found: {path}")
            img = Image.open(path)
        elif isinstance(image, Image.Image):
            img = image
        else:
            raise TypeError(f"Expected str/Path/PIL.Image, got {type(image)}")

        # Convert to RGB if necessary (RGBA/CMYK etc)
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")

        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return base64.b64encode(buf.getvalue()).decode("utf-8")

    def chat(self, messages: List[Dict[str, Any]], stream: bool = False) -> VLMResponse:
        """Send messages to Ollama chat endpoint."""
        payload = {
            "model": self.model,
            "messages": messages,
            "stream": stream,
            "options": {
                "temperature": self.temperature,
                "num_predict": 4096,
            },
        }

        start = time.time()
        for attempt in range(1, self.MAX_RETRIES + 1):
            try:
                resp = self.session.post(
                    f"{self.OLLAMA_URL}/api/chat",
                    json=payload,
                    timeout=self.DEFAULT_TIMEOUT,
                )
                resp.raise_for_status()
                data = resp.json()
                latency = (time.time() - start) * 1000

                raw = data.get("message", {}).get("content", "")
                parsed = self._extract_json(raw)

                # Attempt to find a confidence score inside parsed JSON
                confidence = None
                if isinstance(parsed, dict):
                    confidence = parsed.get("confidence") or parsed.get("confidence_score")

                return VLMResponse(
                    raw_text=raw,
                    parsed_json=parsed,
                    model_used=self.model,
                    prompt_tokens=data.get("prompt_eval_count", 0),
                    completion_tokens=data.get("eval_count", 0),
                    total_tokens=(data.get("prompt_eval_count", 0) + data.get("eval_count", 0)),
                    latency_ms=latency,
                    confidence=confidence,
                )

            except (requests.RequestException, json.JSONDecodeError) as exc:
                if attempt == self.MAX_RETRIES:
                    return VLMResponse(
                        raw_text="",
                        error=f"Ollama chat failed after {self.MAX_RETRIES} attempts: {exc}",
                        model_used=self.model,
                        latency_ms=(time.time() - start) * 1000,
                    )
                time.sleep(self.RETRY_DELAY * attempt)

        # unreachable
        return VLMResponse(raw_text="", error="Unknown error", model_used=self.model)

    def generate(self, prompt: str, images: Optional[List[Union[str, Path, Image.Image]]] = None) -> VLMResponse:
        """Simple generate endpoint (legacy Ollama API). Prefer chat()."""
        imgs_b64 = []
        if images:
            for img in images:
                imgs_b64.append(self.encode_image(img))

        payload = {
            "model": self.model,
            "prompt": prompt,
            "images": imgs_b64,
            "stream": False,
            "options": {
                "temperature": self.temperature,
                "num_predict": 4096,
            },
        }

        start = time.time()
        for attempt in range(1, self.MAX_RETRIES + 1):
            try:
                resp = self.session.post(
                    f"{self.OLLAMA_URL}/api/generate",
                    json=payload,
                    timeout=self.DEFAULT_TIMEOUT,
                )
                resp.raise_for_status()
                data = resp.json()
                latency = (time.time() - start) * 1000

                raw = data.get("response", "")
                parsed = self._extract_json(raw)
                confidence = None
                if isinstance(parsed, dict):
                    confidence = parsed.get("confidence") or parsed.get("confidence_score")

                return VLMResponse(
                    raw_text=raw,
                    parsed_json=parsed,
                    model_used=self.model,
                    prompt_tokens=data.get("prompt_eval_count", 0),
                    completion_tokens=data.get("eval_count", 0),
                    total_tokens=(data.get("prompt_eval_count", 0) + data.get("eval_count", 0)),
                    latency_ms=latency,
                    confidence=confidence,
                )

            except (requests.RequestException, json.JSONDecodeError) as exc:
                if attempt == self.MAX_RETRIES:
                    return VLMResponse(
                        raw_text="",
                        error=f"Ollama generate failed after {self.MAX_RETRIES} attempts: {exc}",
                        model_used=self.model,
                        latency_ms=(time.time() - start) * 1000,
                    )
                time.sleep(self.RETRY_DELAY * attempt)

        return VLMResponse(raw_text="", error="Unknown error", model_used=self.model)

    @staticmethod
    def _extract_json(text: str) -> Optional[Dict[str, Any]]:
        """Extract JSON object from markdown-wrapped or plain text."""
        # Try markdown code block first
        code_match = re.search(r"```(?:json)?\s*\n(.*?)\n```", text, re.DOTALL)
        if code_match:
            candidate = code_match.group(1).strip()
        else:
            # Try first { ... } block
            brace_match = re.search(r"(\{.*\})", text, re.DOTALL)
            if brace_match:
                candidate = brace_match.group(1).strip()
            else:
                return None

        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            return None

    def health_check(self) -> bool:
        """Ping Ollama to verify it's running."""
        try:
            resp = self.session.get(f"{self.OLLAMA_URL}/api/tags", timeout=5)
            return resp.status_code == 200
        except requests.RequestException:
            return False


if __name__ == "__main__":
    import sys
    client = VLMClient()
    print("VLMClient health:", client.health_check())
    print("Auto-select (vision):", VLMClient.auto_select("vision"))
    print("Auto-select (ocr):", VLMClient.auto_select("ocr"))
    print("Auto-select (instruction_parse):", VLMClient.auto_select("instruction_parse"))
