# Estadísticas: diseño y auditoría de cálculos

Ruta existente: `paginas/estadisticas.html`. No se modifican tablas, RLS, Auth,
roles, reglas empresariales, registros ni los módulos Equipo y Trabajos.

## Datos y significado de los indicadores

Se conservan las lecturas anteriores: empresas propias por `propietario_id`,
asignaciones visibles bajo RLS, trabajos de esas asignaciones y perfiles de sus
trabajadores. Continúan las páginas de 500 registros y los filtros `.in` en
grupos de 100 IDs. No se añaden consultas ni RPC. Las asignaciones del informe
siempre deben corresponder a trabajos de empresas propias.

Los indicadores son de **asignaciones**, no de estados de puntos de trabajo:

| Indicador | Definición |
| --- | --- |
| Asignaciones | IDs únicos que satisfacen todos los filtros. |
| Estados y finalizadas | Estado registrado de cada asignación del conjunto filtrado. Canceladas no cuentan como finalizadas. |
| Tiempo real | `fin_en - inicio_en`, en segundos, exclusivamente para finalizadas con ambas marcas válidas y diferencia no negativa. |
| Promedio | Suma de tiempos válidos / número de muestras válidas. No usa el total de finalizadas como denominador. |
| Objetivos cumplidos/no cumplidos | Finalizadas con `objetivo_cumplido === true` o `=== false`. Un resultado ausente no equivale a falso. |
| Cumplimiento | Cumplidas / (cumplidas + no cumplidas) × 100. Sin resultados registrados se muestra «—». |

Un conteo vacío vale cero. Cero segundos con marcas válidas es tiempo real cero.
Sin marcas válidas, tiempo total/promedio son ausentes, no cero. La interfaz
explica cuántas finalizadas aportan muestras. No se generan tendencias ni
comparaciones con períodos que no se hayan calculado.

El período sigue basándose en `programada_para`. **No significa finalización
dentro del período**. El dashboard y la evolución lo indican expresamente. Las
fechas se agrupan y presentan en `America/Bogota`; los límites de calendario
utilizan UTC−5, correspondiente a Colombia en el historial actual de MOVANZA.
Los períodos de 7/30/90 días incluyen desde la medianoche colombiana del primer
día hasta el instante actual. El personalizado incluye ambos días completos.

## Cambios de presentación y correcciones documentadas

1. Antes, los límites de fecha dependían de la zona del dispositivo. Ahora se
   usa la misma zona del informe para límites, tabla y evolución.
2. Antes, fechas inválidas podían dejar métricas anteriores bajo filtros nuevos,
   y la carga podía sobrescribir el error con «Indicadores actualizados».
   Ahora se retiran las métricas y gráficos hasta corregir el filtro; el error
   permanece visible.
3. Antes, una lectura fallida podía dejar variables parcialmente renovadas.
   Ahora los resultados se preparan localmente y se publican juntos al concluir
   todas las lecturas. Un fallo retira las métricas y permite reintentar sin
   presentar datos antiguos como actuales.
4. Se deduplican IDs al leer páginas y calcular resúmenes. Se emplean mapas para
   localizar trabajos y perfiles sin búsquedas repetidas por registro.
5. La empresa activa inicial procede del parámetro existente o de la selección
   guardada. Solo puede preseleccionarse si figura entre las empresas propias.
   Un identificador no autorizado no abre automáticamente «Todas mis empresas»:
   se pide elegir una empresa disponible. Cambiar el filtro no cambia la empresa
   operativa en `sessionStorage`.

Estas correcciones afectan representación y coherencia de lecturas. No cambian
qué estado empresarial tiene un registro ni sus permisos. La paginación REST
existente no constituye una instantánea transaccional del servidor: cambios
concurrentes durante una descarga pueden requerir actualizar el informe.

## Gráficos y distribución

El encabezado es el componente empresarial compartido, con Estadísticas activo;
el banner tiene el contenido solicitado y el footer se extrae del Index.
El resumen principal, los estados y la cuadrícula de gráficos aprovechan el
ancho. Las comparativas completas y el detalle de asignaciones son desplegables.
La comparativa conserva los campos previos usando columnas y efectos del recurso
`recursos/tabla`; el detalle mantiene la tabla semántica, con efectos de fila y
presentación móvil sin desplazamiento horizontal obligatorio.

Gráficos del mismo conjunto filtrado:

- Dona: distribución por estado. Si aparece un estado no reconocido, se incluye
  como «Otros estados registrados» para no alterar el denominador.
- Evolución: asignaciones programadas y, dentro de ellas, finalizadas. Agrupa por
  día, o por mes cuando la extensión excede 120 días. Los intervalos intermedios
  sin asignaciones son ceros reales del conjunto consultado. Fechas ausentes o
  inválidas no se inventan; se indica cuántos registros no participan.
- Actividad: total y finalizadas por trabajador, o por empresa cuando se elige
  la agregación explícita. Presenta hasta ocho grupos; la comparativa conserva
  todos.
- Tiempo: horas reales acumuladas de hasta ocho grupos con marcas válidas.
  No incluye canceladas ni convierte duraciones ausentes en cero.

Se conservan empresa, trabajador, período y fechas. Estado y punto de trabajo
son filtros de presentación sobre los registros ya leídos. Todos los gráficos,
resúmenes y comparativas usan esos mismos criterios sin nuevas consultas.

## Chart.js y accesibilidad

Única dependencia añadida: **Chart.js 4.5.1**, licencia MIT, UMD desde jsDelivr con
versión fija. Se justifica por gráficos responsivos, interacción táctil, leyendas,
tooltips y actualización de instancias; no se añaden framework, plugins ni
adaptadores de fechas. El eje temporal usa categorías calculadas localmente.

Se carga de forma asíncrona para no bloquear el acceso ni los indicadores. Si no
está disponible, los cálculos, detalle y valores textuales siguen funcionando.
Si llega después, los gráficos se dibujan con el modelo actual sin otra consulta.
Cada canvas tiene nombre accesible, resumen y valores consultables con teclado.
No se depende únicamente del color o del tooltip. Se respeta movimiento reducido.
Las instancias se actualizan al cambiar filtros y se destruyen al vaciar o retirar
el informe. Una respuesta pendiente no vuelve a crearlas tras cerrar sesión.

Referencias oficiales:

- [Chart.js](https://www.chartjs.org/docs/latest/)
- [Actualización y destrucción de instancias](https://www.chartjs.org/docs/latest/developers/api.html)
- [Accesibilidad de canvas](https://www.chartjs.org/docs/latest/general/accessibility.html)

## Alcance y métricas no añadidas

La lectura existente obtiene trabajos asociados a asignaciones visibles. No
permite conocer el total de puntos que todavía no tienen asignaciones. Tampoco
existe un estado propio del trabajo equivalente al estado de cada asignación.
No se presentan esos ejemplos como métricas calculadas. Incorporarlos exigiría
ampliar las lecturas o definir otra métrica, fuera de esta implementación.

## Archivos y verificación

- `scripts/estadisticas.js`: lecturas existentes, filtros y coordinación.
- `scripts/estadisticas-calculos.js`: cálculos puros y calendario del informe.
- `scripts/estadisticas-vista.js`: gráficos, comparativas y estados visuales.
- `scripts/estadisticas-interfaz.js` y `estadisticas-carga.js`: guard y carga UI.
- `scripts/generar-estadisticas.mjs`, `paginas/estadisticas.html` y
  `estilos/estadisticas.css`: presentación y componentes compartidos.
- `pruebas/estadisticas.mjs`: pruebas numéricas y de integración con transporte
  simulado. No consulta ni escribe en la base real.

```powershell
node scripts/generar-estadisticas.mjs
node --experimental-vm-modules --disable-warning=ExperimentalWarning pruebas/estadisticas.mjs <directorio-con-jsdom>
```
