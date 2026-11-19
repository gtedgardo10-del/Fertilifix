"""Small, explicit plant questionnaire; no sensor or location inference."""

import re
import unicodedata


def _text(value, limit, label):
    if not isinstance(value, str):
        raise ValueError(f"{label} debe ser texto.")
    value = " ".join(value.split())
    if len(value) > limit:
        raise ValueError(f"{label} admite hasta {limit} caracteres.")
    return value


def _options(*pairs):
    return [{"value": key, "label": label} for key, label in pairs]


SUBSTRATES = _options(
    ("soil", "Suelo de jardín o terreno"),
    ("potting_mix", "Sustrato de maceta"),
    ("succulent_mix", "Mezcla para cactus y suculentas"),
    ("coco", "Fibra de coco"),
    ("hydroponics", "Hidroponía"),
    ("other", "Otro; lo describiré en el chat"),
    ("unknown", "No sé qué sustrato tiene"),
)

PLACEMENTS = _options(
    ("indoors", "Dentro de casa"),
    ("outdoors_open", "Fuera de casa, expuesta a la lluvia"),
    ("outdoors_sheltered", "Fuera de casa, bajo techo o cubierta"),
    ("unknown", "No estoy seguro/a"),
)


def stage_guide(crop):
    normalized = unicodedata.normalize("NFKD", crop.casefold())
    normalized = "".join(c for c in normalized if not unicodedata.combining(c))
    if re.search(r"\b(rosa del desierto|adenium)\b", normalized):
        return {
            "help": (
                "En la rosa del desierto puedes observar brotes, botones, flores o frutos. "
                "Puede crecer y florecer a la vez. Perder hojas por sí solo no confirma reposo; "
                "si tienes dudas, elige «No sé» y describe lo que ves."
            ),
            "options": _options(
                ("young", "Planta joven, con sus primeras hojas"),
                ("vegetative", "Está sacando hojas o brotes nuevos"),
                ("buds", "Tiene botones florales cerrados"),
                ("flowering", "Tiene flores abiertas"),
                ("fruiting", "Tiene frutos alargados con semillas"),
                ("mixed", "Crece y florece al mismo tiempo"),
                ("possible_rest", "Crece poco o perdió hojas; posible reposo"),
                ("unknown", "No sé; necesito ayuda para reconocerla"),
            ),
            "references": [{
                "title": "Rosa del desierto: guía de NC State Extension",
                "url": "https://plants.ces.ncsu.edu/plants/adenium-obesum/",
            }],
        }
    if re.search(r"\b(tomate|jitomate|solanum lycopersicum)\b", normalized):
        return {
            "help": (
                "Observa si predominan hojas nuevas, flores, frutos pequeños o frutos que "
                "están madurando. En tomate pueden coincidir flores y frutos; la edad sola "
                "no determina la etapa."
            ),
            "options": _options(
                ("young", "Plántula con sus primeras hojas"),
                ("vegetative", "Crece en hojas y tallos, sin flores"),
                ("flowering", "Tiene flores abiertas"),
                ("fruiting", "Tiene frutos pequeños o en crecimiento"),
                ("ripening", "Tiene frutos que están madurando"),
                ("mixed", "Tiene flores y frutos al mismo tiempo"),
                ("unknown", "No sé; necesito ayuda para reconocerla"),
            ),
            "references": [{
                "title": "Tomate: guía de University of Minnesota Extension",
                "url": "https://extension.umn.edu/vegetables/growing-tomatoes",
            }],
        }
    return {
        "help": (
            "Las etapas cambian según la especie. Puedes escribir qué observas "
            "(brotes, hojas, flores u otras estructuras) o preguntarme cómo reconocerlas. "
            "Estas opciones son generales; no asumiré que todas las plantas dan flores o frutos."
        ),
        "options": _options(
            ("young", "Es una planta joven o recién establecida"),
            ("active", "Está creciendo y sacando brotes nuevos"),
            ("other", "Veo otro estado; lo describiré en el chat"),
            ("unknown", "No sé; necesito ayuda para reconocerla"),
        ),
        "references": [],
    }


def read_profile(payload):
    profile = {
        "crop": _text(payload.get("crop", ""), 60, "El nombre de la planta"),
        "location": _text(payload.get("location", ""), 160, "La ubicación"),
        "stage": _text(payload.get("stage", ""), 40, "La etapa"),
        "substrate": _text(payload.get("substrate", ""), 40, "El sustrato"),
        "placement": _text(payload.get("placement", ""), 40, "Dónde está la planta"),
    }
    if not profile["crop"] or not profile["location"]:
        raise ValueError("Primero indica la planta y su ciudad o municipio.")
    for field, options in (
        ("placement", PLACEMENTS),
        ("stage", stage_guide(profile["crop"])["options"]),
        ("substrate", SUBSTRATES),
    ):
        labels = {option["value"]: option["label"] for option in options}
        if profile[field] and profile[field] not in labels:
            raise ValueError(f"Selecciona una opción válida para {field}.")
        profile[f"{field}_label"] = labels.get(profile[field], "Sin indicar")
    return profile


def next_question(profile):
    if not profile["placement"]:
        return {
            "field": "placement",
            "question": "¿Dónde está normalmente tu planta?",
            "help": (
                "Si está fuera, indica si la lluvia puede llegarle directamente o si queda bajo techo. "
                "Así el pronóstico no se toma como agua recibida por la maceta."
            ),
            "options": PLACEMENTS,
            "references": [],
        }
    if not profile["substrate"]:
        return {
            "field": "substrate",
            "question": "¿En qué está plantada?",
            "help": (
                "El suelo o sustrato ayuda a interpretar las mediciones. "
                "Si elegiste «No sé» en la etapa, podemos seguir aclarando tus dudas en el chat."
            ),
            "options": SUBSTRATES,
            "references": [],
        }
    if not profile["stage"]:
        return {
            "field": "stage",
            "question": f"Ahora, ¿qué observas en tu planta ({profile['crop']})?",
            **stage_guide(profile["crop"]),
        }
    return None


def read_conversation(value):
    if not isinstance(value, list):
        raise ValueError("El historial debe ser una lista.")
    messages = []
    for item in value[-8:]:
        if not isinstance(item, dict) or item.get("role") not in ("user", "assistant"):
            continue
        content = item.get("content")
        if isinstance(content, str) and content.strip():
            messages.append({"role": item["role"], "content": content.strip()[:1000]})
    return messages
