# Entrenamiento del parche de Nexo

Generado: 2026-08-15T10:29:20.809Z

Base fijada: Nexo 9c03b8d8

## Entrenamiento

- Duelos: 50
- Resultado del candidato: 22-27-1
- Inválidos: 0

## Evaluación separada contra la base

- Duelos: 50
- Resultado del parche: 28-21-1
- Win rate: 56.0 %
- Puntuación con empates: 57.0 %
- Confianza 95 % de victorias: 42.3 % – 68.8 %
- Inválidos: 0

| Mazo espejo | V-D-E del parche | Inválidos |
|---|---:|---:|
| chaos-turbo | 7-3-0 | 0 |
| goat-control | 7-3-0 | 0 |
| flip-control | 5-5-0 | 0 |
| warrior | 6-4-0 | 0 |
| panda-burn | 3-6-1 | 0 |

## Comparación de acciones en evaluación

| Modelo | Examinadas | Razonadas | Sólidas | Revisión | Sospechosas | Valor público medio |
|---|---:|---:|---:|---:|---:|---:|
| Parche | 17292 | 5584 | 5581 | 3 | 0 | 0.344 |
| Nexo base | 16415 | 4497 | 4486 | 10 | 1 | 0.296 |

## Puertas de promoción

- baselinePinned: PASS
- trainingClean: PASS
- evaluationClean: PASS
- enoughEvidence: PASS
- candidateActionsClean: PASS
- noActionRegression: PASS
- beatsBase: FAIL

Resultado: **CANDIDATE_NOT_PROMOTED**

El parche sólo puede sustituir a Nexo si vence a la base fijada, no degrada las acciones y toda la ejecución OCGCore es válida.

## Registro retenido

- Un registro por combate con seed, mazo, asiento, resultado, validez y resumen de acciones.
- Un registro compacto por cada decisión razonada de ambos bots; las respuestas forzadas quedan contabilizadas en el resumen.
- La base activa no se modifica durante el entrenamiento.

## Límite

Los registros atribuyen resultados y comparan alternativas públicas; no revelan información oculta ni prueban que una acción sea óptima en todos los estados.
