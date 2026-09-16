# fixtures — importacion de personajes (EPIC-004, FEAT-017)

Archivos pequenos generados a proposito (no descargados de terceros) para el paso 4.6 y el Hito 7: uno importado valido, uno con archivo danado, uno sin control de boca.

| Archivo | Que demuestra |
|---|---|
| `personaje-valido.glb` | Header glTF binario real: magic `glTF`, version `2`, `length` coincide con el tamano real del archivo — pasa `validate_vrm_header` |
| `personaje-danado.glb` | Magic bytes incorrectos (no es un glTF) — TC-047, rechazo con motivo |
| `personaje-sin-boca.model3.json` | Manifiesto Live2D valido (`Version`/`FileReferences`) — como Live2D declara `mouth: false` por formato (no se parsea el `.moc3`), sirve como personaje de prueba sin control de boca para el Hito 7 (TC-064) |

Ninguno de los tres tiene un modelo 3D/rig real detras: la validacion de este Hito es de estructura de archivo, no de renderizado (fuera de alcance, ver `avatar-and-tts.md`).
