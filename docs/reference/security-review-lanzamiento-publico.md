# Revisión de seguridad — `lanzamiento-publico` Hito 7

> Primera revisión de seguridad ejecutada en este proyecto (nunca se había corrido `/security-review` ni `cargo audit`). Cubre AC-2.1 y AC-2.2 de `specs/lanzamiento-publico/spec.md`.

## Metodología

La skill nativa `/security-review` no pudo invocarse en su forma automática: su paso de precarga ejecuta `git diff origin/HEAD...` para obtener el diff a revisar, y este repositorio no tiene ningún remoto configurado (`git remote -v` vacío), por lo que ese comando falla antes de que la skill llegue a cargar su cuerpo. Se intentó crear una referencia local temporal `refs/remotes/origin/HEAD` para satisfacer el comando, pero la sintaxis de tres puntos que usa la skill (`origin/HEAD...` con nada después) resulta en un diff vacío en este entorno — un desajuste estructural entre el diseño de la skill (pensado para revisar una rama divergida contra un remoto compartido) y este repositorio (sin remoto, con trabajo acumulado sin commitear). Se removió la referencia temporal (operación local, reversible, sin efecto en ningún remoto).

En su lugar se ejecutó la revisión manualmente, con el mismo estándar (OWASP-relevante, foco en inyección, XSS, manejo de secretos, fronteras de confianza), sobre:
1. El diff acumulado completo (`git diff HEAD`, 61 archivos, working tree completo del proyecto — no solo el delta de este plan).
2. La superficie de riesgo ya identificada explícitamente por el usuario (AC-2.2): `AdminSettingsPanel.vue` (comandos reales `claude mcp add/remove`/`claude plugin *` contra el `.claude.json`/`settings.json` reales del usuario) y los archivos de configuración en `AppData\Roaming\com.codetuver.avatar\`.
3. `cargo audit` sobre las dependencias de `src-tauri/` (ver sección dedicada).

## Hallazgos y triage

Ningún hallazgo real. Cero cambios de código en esta revisión.

### 1. Comandos reales contra `claude` (`AdminSettingsPanel.vue` → `claude_admin.rs`)

**Triage: falso positivo — ya mitigado por diseño, confirmado por lectura directa.**

- `add_mcp_server`/`remove_mcp_server`/`add_plugin_marketplace`/`install_plugin`/`uninstall_plugin` (`claude_admin.rs:374-454`) todos invocan `run_claude(args: &[&str], ...)`, que construye el proceso con `Command::new(program).args(args)` (`claude_admin.rs:241-242`) — argumentos pasados como arreglo `argv`, **nunca a través de un shell** (`cmd /C`/`sh -c`). Un `name`/`command` con metacaracteres de shell (`; rm -rf`, `` ` ``, `&&`) llega como un único argumento literal al binario `claude`, sin interpretación de shell posible. Sin vulnerabilidad de inyección de comandos.
- `read_settings_file`/`filter_allowed_keys` (`claude_admin.rs:202-219`) exponen `settings.json` al frontend por **lista blanca explícita** (`ALLOWED_SETTINGS_KEYS = ["permissions"]`, línea 11) — no una lista negra. El resto del contenido real del archivo del usuario nunca cruza al frontend.
- Los cambios nuevos de esta sesión en `AdminSettingsPanel.vue` (confirmación in-place de "Quitar" MCP, mensajes de error de formulario) son puramente de UI — usan interpolación `{{ }}` de Vue (auto-escapada), sin `v-html`, y no introducen ninguna llamada nueva a `invoke`/`run_claude` más allá de las ya existentes. Superficie sin cambio real.

### 2. Archivos de configuración en `AppData\Roaming\com.codetuver.avatar\`

**Triage: falso positivo — confirmado vigente, AC-028.2 sigue cumpliéndose.**

Inspección directa de `app-settings.json` y `preferences.json` reales del usuario: solo preferencias de UI (posición/tamaño de ventana, color de tema, opciones de arranque de sesión) y metadatos de sesión no sensibles (`sessionId`, `lastWorkingDirectory`). Sin tokens, contraseñas, ni claves de API en ningún archivo persistido por la app.

### 3. Frontera de confianza de contenido renderizado (`v-html`)

**Triage: falso positivo — ya mitigado, confirmado por lectura directa.**

Los 5 usos reales de `v-html` en el proyecto (`App.vue:1803,1901,2121,2365`, `ContentBlockRenderer.vue:45`) enrutan **todos** por la misma función `renderChatDraftMarkdown` (`chat-draft-markdown.ts`), que instancia `markdown-it` con `html: false` (línea 4, comentado explícitamente como la frontera de confianza elegida: "markdown-it escapa HTML crudo en vez de dejarlo pasar, sin sumar un sanitizador aparte"). Contenido con `<script>`/`<img onerror>` etc. se escapa a texto visible, no se ejecuta. Los cambios de esta sesión (Hito 11 de `correcciones-qa-gauntlet`, neutralización de backticks sueltos) no tocan ni debilitan esta configuración — confirmado por lectura directa de las 4 primeras líneas del archivo.

- **Enlaces generados por `linkify: true`**: interceptados por `external-link-click.ts` (`event.preventDefault()` + `openUrl()` del plugin oficial `@tauri-apps/plugin-opener`) — un enlace generado desde markdown nunca navega la ventana del webview, se abre en el navegador del sistema. Mitiga secuestro de navegación dentro de la app.

### 4. Patrones generales de riesgo (grep dirigido)

- `eval(`, `innerHTML`, `dangerouslySetInnerHTML`, `Command::new("cmd")`/`("sh")` con entrada de usuario, `unsafe`, `transmute`, secretos hardcodeados: **cero coincidencias reales** en `src/`+`src-tauri/src/` fuera de bloques `#[cfg(test)]` con literales fijos (sin entrada de usuario, ej. `spawn_fake_child` para pruebas de ciclo de vida de procesos).
- El diff acumulado de esta sesión (61 archivos, ver `git diff HEAD --stat`) no introduce ningún patrón de los anteriores.

## `cargo audit`

Instalado por primera vez en este proyecto (`cargo install cargo-audit --locked`, corrido desde `src-tauri/` para que el `rust-toolchain.toml` local fuerce el target `x86_64-pc-windows-msvc` — instalarlo desde la raíz del repo usa el toolchain `gnu` por defecto de `rustup`, que falla por falta de `dlltool.exe`/binutils de MinGW en esta máquina). `cargo audit` sobre 496 dependencias de `Cargo.lock`: **exit code 0, cero vulnerabilidades reales (`RUSTSEC` de tipo "Vulnerability")**. 7 advertencias informativas, ninguna bloqueante:

| Crate | Tipo | Origen | Triage |
|---|---|---|---|
| `proc-macro-error` 1.0.4 | unmaintained | dependencia de compilación (proc-macro), no en el binario final | Aceptado — sin superficie de ataque en runtime |
| `unic-char-property`/`unic-char-range`/`unic-common`/`unic-ucd-ident`/`unic-ucd-version` 0.9.0 (5 crates) | unmaintained | transitivas de `urlpattern` ← `tauri-utils` (framework Tauri oficial, `cargo tree -i` confirmado) | Aceptado — fuera del control de este proyecto, requeriría un release de Tauri; sin vulnerabilidad, solo falta de mantenimiento activo |
| `glib` 0.18.5 | unsound (RUSTSEC-2024-0429) | dependencia condicional de Tauri para backends GTK/Linux (`cargo tree -i glib` no encuentra el crate en el árbol del target Windows real) | Aceptado — D1 ya confirmó distribución Windows-exclusiva; el código GTK afectado no se compila ni se ejecuta en el binario real que se distribuye |

Ningún hallazgo requiere acción de este proyecto: los 7 son dependencias transitivas del propio framework Tauri (no código propio), sin vulnerabilidad confirmada, y el único marcado "unsound" corresponde a una plataforma (Linux/GTK) que este proyecto no distribuye.

## Conclusión

**AC-2.1 y AC-2.2 cumplidos.** Cero hallazgos reales que corregir — la superficie de riesgo ya identificada por el usuario (`AdminSettingsPanel.vue`, `AppData`) se confirmó correctamente mitigada por diseño ya existente (argv-safe process spawning, allowlist de settings, `html:false` en markdown-it, interceptor de enlaces externos). `cargo audit` instalado y corrido por primera vez: 0 vulnerabilidades reales, 7 advertencias informativas triadas y aceptadas (todas transitivas de Tauri, ninguna del código propio de este proyecto).
