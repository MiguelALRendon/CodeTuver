---
status: accepted
date: 2026-08-27
deciders: [propietario del proyecto, investigacion FEAT-003]
---

# 0009. El catálogo de avatares incluidos en la descarga usa VRM; Live2D queda solo para importación

## Context and Problem Statement

La aplicación se publica gratis (**R9**): todo personaje incluido en la descarga necesita licencia de redistribución explícita, no solo una licencia de uso. Había que comparar formatos y candidatos reales, licencia por licencia, sin asumir que aparecer en una tienda de modelos implica poder redistribuirlo.

## Considered Options

- **VRM** vía `@pixiv/three-vrm` (MIT) sobre Three.js/WebGL, con candidatos CC0 reales encontrados (`opensourceavatars.com`).
- **Live2D** vía Cubism SDK for Web, con modelos de muestra bajo "Free Material License".
- Otros formatos (Spine, sprites, modelos genéricos glTF) — evaluados en la comparativa pero sin candidato concreto investigado a fondo.

## Decision Outcome

Elegida: **VRM** para el catálogo de personajes incluidos en la descarga. Razón basada en licencia, no en preferencia técnica: se encontró y confirmó un candidato real con licencia **CC0 inequívoca** (`opensourceavatars.com`, "All avatars CC0" — sin atribución, uso comercial y redistribución permitidos explícitamente). Live2D, en cambio, además de la licencia del modelo individual, arrastra una obligación legal separada — el "SDK Release License Agreement" de publicación del Cubism SDK — que este informe no puede resolver por su cuenta; por la regla del propio proyecto ("ningún candidato de licencia ambigua se marca apto para la descarga"), Live2D **no** entra al catálogo incluido.

**Importación de personajes propios:** se soportan tanto VRM como Live2D — ahí la responsabilidad de licencia es de la persona que importa su propio archivo, no de la aplicación que lo redistribuye.

El avatar de prueba del Hito 2 (un círculo CSS) se mantiene como placeholder reemplazable hasta que FEAT-015 integre un modelo VRM real — cumple el requisito del `how-to` de "avatar de prueba claramente reemplazable" sin bloquear el resto de la investigación.

### Consequences

- Positiva: cero riesgo legal en el catálogo incluido — CC0 es la licencia más simple posible.
- Positiva: `@pixiv/three-vrm` corre sobre WebGL estándar, compatible con el WebView de Tauri sin trabajo nativo adicional (mismo mecanismo confirmado en el Hito 2 para la ventana).
- Negativa: ningún modelo VRM individual de la colección fue descargado ni auditado por calidad/rigging en esta investigación — riesgo de calidad, no de licencia, pendiente de EPIC-004.
- Negativa: si en el futuro se quiere ofrecer Live2D con soporte oficial (no solo "trae tu propio archivo"), el propietario del proyecto deberá resolver la obligación de licencia de publicación del SDK — decisión de negocio, no técnica, fuera del alcance de este ADR.

## More Information

- `docs/research/avatar-and-tts.md`, sección de avatar.
- Fichas completas de los dos candidatos evaluados en el mismo documento.
- Matriz avatar-reacción contra `docs/reference/avatar-reacciones-voz.md`.
