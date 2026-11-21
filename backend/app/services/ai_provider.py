import os
import json
import base64
import time
import hashlib
from typing import List, Tuple, Dict, Any, Optional
from dataclasses import dataclass
from datetime import datetime, timezone
import httpx
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.core.config import settings
from app.models.entities import AISettings, AIUsage, AICache, utc_now

PROMPT_VERSION = "9.0"

class AIProviderError(Exception):
    pass

class AIQuotaExceeded(AIProviderError):
    pass

@dataclass
class AIResult:
    data: Dict[str, Any]
    input_tokens: int = 0
    output_tokens: int = 0
    provider: str = ""
    model: str = ""

class BaseProvider:
    name: str = "base"

    def generate_json(
        self,
        system_prompt: str,
        user_prompt: str,
        schema: Dict[str, Any],
        images: Optional[List[Tuple[bytes, str]]] = None,
        model_override: Optional[str] = None
    ) -> AIResult:
        raise NotImplementedError

    def list_models(self) -> List[Dict[str, Any]]:
        return []

    def health(self) -> Dict[str, Any]:
        return {"status": "ok"}

class GeminiProvider(BaseProvider):
    name: str = "gemini"

    def __init__(self, api_key: str, model: Optional[str] = None):
        self.api_key = api_key
        self.model = model or settings.GEMINI_DEFAULT_MODEL

    def _get_live_model_ids(self) -> List[str]:
        try:
            live = self.list_models()
            if live:
                return [m["id"] for m in live]
        except Exception:
            pass
        return []

    def _resolve_candidate_models(self, requested_model: Optional[str]) -> List[str]:
        default_chain = [
            "gemini-1.5-flash",
            "gemini-2.0-flash",
            "gemini-1.5-pro",
            "gemini-1.5-flash-8b",
            "gemini-2.0-flash-lite",
            "gemini-3.8-flash",
            "gemini-2.5-flash",
        ]

        live_ids = self._get_live_model_ids()
        if live_ids:
            flash_live = [m for m in live_ids if "flash" in m.lower()]
            other_live = [m for m in live_ids if "flash" not in m.lower()]
            active_live = flash_live + other_live
        else:
            active_live = []

        if not requested_model or requested_model.lower() in ("auto", "automatico"):
            candidates = []
            for m in active_live:
                if m not in candidates:
                    candidates.append(m)
            for m in default_chain:
                if m not in candidates:
                    candidates.append(m)
            return candidates or default_chain

        candidates = [requested_model]
        for m in active_live:
            if m != requested_model and m not in candidates:
                candidates.append(m)
        for m in default_chain:
            if m != requested_model and m not in candidates:
                candidates.append(m)
        return candidates

    def generate_json(
        self,
        system_prompt: str,
        user_prompt: str,
        schema: Dict[str, Any],
        images: Optional[List[Tuple[bytes, str]]] = None,
        model_override: Optional[str] = None
    ) -> AIResult:
        requested_model = model_override or self.model
        candidates = self._resolve_candidate_models(requested_model)

        headers = {
            "x-goog-api-key": self.api_key,
            "Content-Type": "application/json"
        }

        # Build parts
        parts: List[Dict[str, Any]] = [{"text": user_prompt}]
        if images:
            for img_bytes, mime_type in images:
                b64_data = base64.b64encode(img_bytes).decode("ascii")
                parts.append({
                    "inlineData": {
                        "mimeType": mime_type,
                        "data": b64_data
                    }
                })

        payload: Dict[str, Any] = {
            "systemInstruction": {"parts": [{"text": system_prompt}]},
            "contents": [{"role": "user", "parts": parts}],
            "generationConfig": {
                "temperature": 0.2,
                "responseMimeType": "application/json",
                "responseSchema": schema
            }
        }

        timeout = httpx.Timeout(settings.AI_REQUEST_TIMEOUT_SECONDS)
        last_error = ""

        with httpx.Client(timeout=timeout) as client:
            for target_model in candidates:
                url = f"{settings.GEMINI_API_BASE}/models/{target_model}:generateContent"
                try:
                    resp = client.post(url, headers=headers, json=payload)
                except httpx.RequestError as exc:
                    last_error = f"Errore connessione rete per {target_model}: {exc}"
                    continue

                # Retry once without responseSchema if HTTP 400 schema error
                if resp.status_code == 400 and ("schema" in resp.text.lower() or "responseschema" in resp.text.lower()):
                    fallback_payload = dict(payload)
                    fallback_payload["generationConfig"] = {
                        "temperature": 0.2,
                        "responseMimeType": "application/json"
                    }
                    schema_hint = f"\nRispetta tassativamente questo JSON Schema per la risposta:\n{json.dumps(schema)}"
                    fallback_payload["contents"][0]["parts"][0]["text"] += schema_hint
                    try:
                        resp = client.post(url, headers=headers, json=fallback_payload)
                    except httpx.RequestError as exc:
                        last_error = f"Errore connessione rete per {target_model}: {exc}"
                        continue

                # Quota exceeded: report immediately
                if resp.status_code == 429:
                    raise AIQuotaExceeded("Quota gratuita Gemini esaurita, riprova più tardi")

                # If 404 (model not found / deprecated for new users) or 503 (high demand) or 400 not supported:
                # Fallback to next candidate model!
                if resp.status_code in (404, 503) or (resp.status_code == 400 and ("not found" in resp.text.lower() or "not supported" in resp.text.lower())):
                    last_error = f"Modello '{target_model}' non disponibile (HTTP {resp.status_code}): {resp.text}"
                    continue

                if resp.status_code != 200:
                    last_error = f"Errore Gemini API ({resp.status_code}) su '{target_model}': {resp.text}"
                    continue

                try:
                    res_json = resp.json()
                except Exception as e:
                    last_error = f"Risposta non valida da Gemini per '{target_model}': {e}"
                    continue

                candidates_list = res_json.get("candidates", [])
                if not candidates_list:
                    last_error = f"Nessun candidato generato da Gemini per '{target_model}'"
                    continue

                text_content = candidates_list[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                try:
                    parsed_data = json.loads(text_content)
                except Exception as e:
                    last_error = f"Gemini non ha restituito JSON valido per '{target_model}': {text_content}"
                    continue

                usage = res_json.get("usageMetadata", {})
                in_tokens = usage.get("promptTokenCount", 0)
                out_tokens = usage.get("candidatesTokenCount", 0)

                return AIResult(
                    data=parsed_data,
                    input_tokens=in_tokens,
                    output_tokens=out_tokens,
                    provider=self.name,
                    model=target_model
                )

        raise AIProviderError(f"Tutti i modelli tentati sono risultati non disponibili o sovraccarichi. Dettaglio: {last_error}")

    def list_models(self) -> List[Dict[str, Any]]:
        url = f"{settings.GEMINI_API_BASE}/models"
        headers = {"x-goog-api-key": self.api_key}
        timeout = httpx.Timeout(15.0)
        try:
            with httpx.Client(timeout=timeout) as client:
                resp = client.get(url, headers=headers)
                if resp.status_code != 200:
                    return []
                data = resp.json()
                models = []
                for m in data.get("models", []):
                    methods = m.get("supportedGenerationMethods", [])
                    if "generateContent" in methods:
                        m_id = m.get("name", "").removeprefix("models/")
                        models.append({
                            "id": m_id,
                            "display_name": m.get("displayName", m_id),
                            "input_token_limit": m.get("inputTokenLimit")
                        })
                return models
        except Exception:
            return []

class OllamaProvider(BaseProvider):
    name: str = "ollama"

    def __init__(self, base_url: str = "http://localhost:11434", model: Optional[str] = None):
        self.base_url = base_url.rstrip("/")
        self.model = model or "llama3.2"

    def generate_json(
        self,
        system_prompt: str,
        user_prompt: str,
        schema: Dict[str, Any],
        images: Optional[List[Tuple[bytes, str]]] = None,
        model_override: Optional[str] = None
    ) -> AIResult:
        target_model = model_override or self.model
        url = f"{self.base_url}/api/chat"

        user_msg: Dict[str, Any] = {
            "role": "user",
            "content": user_prompt
        }
        if images:
            b64_images = [base64.b64encode(img[0]).decode("ascii") for img in images]
            user_msg["images"] = b64_images

        payload = {
            "model": target_model,
            "stream": False,
            "format": "json",
            "options": {"temperature": 0.2},
            "messages": [
                {"role": "system", "content": system_prompt},
                user_msg
            ]
        }

        timeout = httpx.Timeout(settings.AI_REQUEST_TIMEOUT_SECONDS)
        try:
            with httpx.Client(timeout=timeout) as client:
                resp = client.post(url, json=payload)
        except Exception as e:
            raise AIProviderError(f"Ollama non raggiungibile su {self.base_url}: {e}")

        if resp.status_code != 200:
            raise AIProviderError(f"Errore Ollama ({resp.status_code}): {resp.text}")

        try:
            res_json = resp.json()
            content = res_json.get("message", {}).get("content", "")
            parsed_data = json.loads(content)
        except Exception as e:
            raise AIProviderError(f"Ollama non ha restituito JSON valido: {e}")

        in_tokens = res_json.get("prompt_eval_count", 0)
        out_tokens = res_json.get("eval_count", 0)

        return AIResult(
            data=parsed_data,
            input_tokens=in_tokens,
            output_tokens=out_tokens,
            provider=self.name,
            model=target_model
        )

    def list_models(self) -> List[Dict[str, Any]]:
        url = f"{self.base_url}/api/tags"
        timeout = httpx.Timeout(10.0)
        try:
            with httpx.Client(timeout=timeout) as client:
                resp = client.get(url)
                if resp.status_code != 200:
                    return []
                data = resp.json()
                return [{"id": m["name"], "display_name": m["name"]} for m in data.get("models", [])]
        except Exception:
            return []

class FakeProvider(BaseProvider):
    name: str = "fake"

    def __init__(self, responses: Optional[List[Dict[str, Any]]] = None, error: Optional[Exception] = None):
        self.responses = list(responses) if responses else [{}]
        self.error = error
        self.call_count = 0
        self.calls: List[Dict[str, Any]] = []

    def generate_json(
        self,
        system_prompt: str,
        user_prompt: str,
        schema: Dict[str, Any],
        images: Optional[List[Tuple[bytes, str]]] = None,
        model_override: Optional[str] = None
    ) -> AIResult:
        self.call_count += 1
        self.calls.append({
            "system_prompt": system_prompt,
            "user_prompt": user_prompt,
            "schema": schema,
            "images": images,
            "model_override": model_override
        })
        if self.error:
            raise self.error
        idx = min(self.call_count - 1, len(self.responses) - 1)
        resp_data = self.responses[idx]
        return AIResult(
            data=resp_data,
            input_tokens=10,
            output_tokens=10,
            provider=self.name,
            model="fake-model"
        )

    def list_models(self) -> List[Dict[str, Any]]:
        return [{"id": "fake-model", "display_name": "Fake Model", "input_token_limit": 8192}]

_PROVIDER_OVERRIDE: Optional[BaseProvider] = None

def set_provider_override(p: Optional[BaseProvider]):
    global _PROVIDER_OVERRIDE
    _PROVIDER_OVERRIDE = p

def get_ai_settings(db: Session, user_id: str) -> AISettings:
    settings_obj = db.query(AISettings).filter(AISettings.user_id == user_id).first()
    if not settings_obj:
        settings_obj = AISettings(
            user_id=user_id,
            provider="none",
            daily_request_cap=100,
            allow_cloud_images=0
        )
        db.add(settings_obj)
        db.commit()
        db.refresh(settings_obj)
    return settings_obj

def get_provider(db: Session, user_id: str) -> Optional[BaseProvider]:
    if _PROVIDER_OVERRIDE is not None:
        return _PROVIDER_OVERRIDE

    ai_settings = get_ai_settings(db, user_id)
    if ai_settings.provider == "none":
        return None

    if ai_settings.provider == "gemini":
        key = settings.GEMINI_API_KEY or ai_settings.api_key
        if not key:
            return None
        model = ai_settings.model_text or settings.GEMINI_DEFAULT_MODEL
        return GeminiProvider(api_key=key, model=model)

    if ai_settings.provider == "ollama":
        base_url = ai_settings.ollama_base_url or "http://localhost:11434"
        model = ai_settings.model_text or "llama3.2"
        return OllamaProvider(base_url=base_url, model=model)

    return None

def run_ai_json(
    db: Session,
    user_id: str,
    feature: str,
    system_prompt: str,
    user_prompt: str,
    schema: Dict[str, Any],
    images: Optional[List[Tuple[bytes, str]]] = None,
    cache_input: Optional[str] = None,
    model_override: Optional[str] = None
) -> Optional[AIResult]:
    provider = get_provider(db, user_id)
    if provider is None:
        return None

    ai_settings = get_ai_settings(db, user_id)

    # Privacy check for cloud images
    if images and provider.name == "gemini" and not bool(ai_settings.allow_cloud_images):
        raise AIProviderError("Invio immagini al cloud non autorizzato (abilita 'Consenti invio immagini al cloud' nelle Impostazioni AI per usare Gemini Vision)")

    target_model = model_override or getattr(provider, "model", "")

    # 3. Cache check
    cache_dict = {
        "feature": feature,
        "provider": provider.name,
        "model": target_model,
        "prompt_version": PROMPT_VERSION,
        "input": cache_input or user_prompt
    }
    cache_key = hashlib.sha256(json.dumps(cache_dict, sort_keys=True).encode("utf-8")).hexdigest()

    cached = db.query(AICache).filter(AICache.cache_key == cache_key, AICache.user_id == user_id).first()
    if cached:
        cached_dt = cached.created_at
        if cached_dt.tzinfo is None:
            cached_dt = cached_dt.replace(tzinfo=timezone.utc)
        age_days = (utc_now() - cached_dt).total_seconds() / 86400.0
        if age_days < settings.AI_CACHE_TTL_DAYS:
            try:
                cached_data = json.loads(cached.response_json)
                return AIResult(
                    data=cached_data,
                    input_tokens=0,
                    output_tokens=0,
                    provider=provider.name,
                    model=target_model
                )
            except Exception:
                pass

    # 4. Daily quota check
    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    cap = ai_settings.daily_request_cap if ai_settings else 100
    used_today = db.query(func.coalesce(func.sum(AIUsage.requests), 0)).filter(
        AIUsage.user_id == user_id,
        AIUsage.day == today_str
    ).scalar() or 0

    if used_today >= cap:
        raise AIQuotaExceeded("Limite giornaliero AI raggiunto (configurabile in Impostazioni)")

    # 5. Call provider
    result = provider.generate_json(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        schema=schema,
        images=images,
        model_override=target_model
    )

    # 6. Upsert AIUsage
    usage_entry = db.query(AIUsage).filter(
        AIUsage.user_id == user_id,
        AIUsage.day == today_str,
        AIUsage.provider == provider.name
    ).first()
    if not usage_entry:
        usage_entry = AIUsage(
            user_id=user_id,
            day=today_str,
            provider=provider.name,
            requests=1,
            input_tokens=result.input_tokens,
            output_tokens=result.output_tokens
        )
        db.add(usage_entry)
    else:
        usage_entry.requests += 1
        usage_entry.input_tokens += result.input_tokens
        usage_entry.output_tokens += result.output_tokens

    # 7. Upsert AICache
    if cached:
        cached.response_json = json.dumps(result.data)
        cached.created_at = utc_now()
    else:
        new_cache = AICache(
            cache_key=cache_key,
            user_id=user_id,
            feature=feature,
            response_json=json.dumps(result.data),
            created_at=utc_now()
        )
        db.add(new_cache)

    db.commit()
    return result
