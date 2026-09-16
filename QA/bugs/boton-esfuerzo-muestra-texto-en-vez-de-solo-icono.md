# El botón de nivel de esfuerzo muestra el texto del nivel, debería mostrar solo el ícono

**Caso general que se estaba revisando:** Uso rudo de la app real, reportado directamente por el usuario con captura de pantalla del control de esfuerzo en la barra de acciones del composer (junto al botón de expandir y el de enviar).
**Prueba específica armada:** Inspección visual real por el usuario (captura adjunta) del botón cerrado del selector de esfuerzo — muestra `⌒ medium` (ícono `gauge` + la palabra "medium") en vez de solo el ícono.
**Qué tronó:** El botón cerrado (trigger) del `CustomSelect` de esfuerzo lleva el nombre del nivel actual escrito al lado del ícono, ocupando espacio en la barra de acciones que debería ser solo iconográfica (a la par de los botones "Expandir vista Markdown" y "Enviar", ambos solo-ícono).
**Cómo tronó:** `App.vue`, uso del slot `#trigger` de `CustomSelect` para el control de esfuerzo:
```html
<template #trigger>
  <IconGlyph name="gauge" />
  <span class="chat-effort-control__level">{{ effortLevel }}</span>
</template>
```
El `<span class="chat-effort-control__level">{{ effortLevel }}</span>` imprime el texto del nivel actual (`low`/`medium`/`high`/`xhigh`/`max`) directo en el botón cerrado — a diferencia del resto de los botones de esa barra, que son solo-ícono.
**Resultado esperado según el usuario:** El botón cerrado debe llevar **únicamente el ícono** (`gauge`), sin texto — el texto de cada nivel (`low`, `medium`, etc.) debe aparecer solo dentro del listado desplegable de opciones al abrir el select, no en el botón mismo.
**Evidencia:** Captura de pantalla real del usuario + confirmación directa contra el código fuente (`App.vue`, bloque `<template #trigger>` del `chat-effort-control`).
**¿Bloquea el Hito de QA en curso?:** No. Es un ajuste de diseño puntual (quitar el `<span>` del slot trigger), sin efecto funcional — el valor seleccionado sigue siendo el correcto, solo cambia qué se muestra en el botón cerrado. Documentado, no corregido (por instrucción del propio catálogo: solo documentar y seguir).

**Corregido:** `<span class="chat-effort-control__level">` eliminado del slot `#trigger` en `App.vue`; el `aria-label`/`title` del botón (`Nivel de esfuerzo: ${effortLevel}`) ya existían de antes y cubren la información para lectores de pantalla sin necesidad de un `sr-only` adicional. El nivel sigue visible en el listado desplegable. CSS huérfano `.chat-effort-control__level` eliminado. Ver `specs/correcciones-qa-gauntlet/plan.md` Hito 10.
