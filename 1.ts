Excelente pregunta de seguridad — y la respuesta corta es: **actualmente NO lo tienes cubierto del todo**. Tienes una defensa parcial (tu Result pattern), pero hay un hueco real. Te explico el porqué y después lo cerramos.

## Por qué no se debe mostrar un stack trace al consumidor

Un stack trace expone información interna que un atacante puede usar:

**1. Revela tu estructura de código**
```
System.NullReferenceException: Object reference not set...
   at Ordenes.Infraestructura.Persistencia.RepositorioOrdenesEfCore.ObtenerPorIdAsync(...)
   at Ordenes.Aplicacion.CasosDeUso.ConsultarOrdenPorId.EjecutarAsync(...)
```
Un atacante ahora sabe nombres exactos de clases, métodos, namespaces — literalmente el mapa de tu arquitectura interna.

**2. Puede revelar la tecnología y versión exacta**
```
at Microsoft.EntityFrameworkCore.SqlServer, Version=8.0.1.0...
```
Si existe una vulnerabilidad conocida (CVE) para esa versión específica de EF Core o de una librería, el atacante ya sabe exactamente qué exploit probar.

**3. Puede filtrar información de la base de datos**
```
Microsoft.Data.SqlClient.SqlException: Invalid column name 'PrecioUnitario2'.
```
Esto revela nombres de columnas/tablas reales — información que ayuda a construir un ataque de SQL Injection dirigido, o simplemente entender tu modelo de datos sin permiso.

**4. Puede revelar rutas del servidor**
```
at C:\ProyectosPublicados\PlataformaOrdenes\Infraestructura\...
```
Rutas de archivos del servidor de producción — información que no debería salir nunca de tu infraestructura.

**5. Rompe el contrato de la API (conectando con lo que vimos del Día 1)**
Un consumidor de tu API (Angular, un tercero) no debería recibir un error con forma impredecible. El contrato dice: "los errores tienen esta forma estándar" (tu `ProblemDetails`). Un stack trace crudo rompe esa promesa.

## ¿Ya lo hacen ustedes? — Diagnóstico real de tu proyecto

Tienes **dos categorías de errores**, y solo una está bien protegida:

### ✅ Errores de negocio conocidos (SÍ están protegidos)

Cuando lanzas `ExcepcionDominio` y la capturas en el caso de uso:

```csharp
catch (ExcepcionDominio ex)
{
    return Resultado.Fallo<OrdenResponse>(Error.Validacion(ex.Message));
}
```

Esto nunca llega a exponer un stack trace — tu `ManejarResultado` devuelve un `ProblemDetails` limpio y controlado. ✅ Bien.

### ❌ Errores NO controlados (NO están protegidos todavía)

¿Qué pasa si ocurre algo que **no** es una `ExcepcionDominio`? Por ejemplo:
- La base de datos está caída (`SqlException`)
- Un `NullReferenceException` por un bug
- Timeout de red

Ninguno de tus `try/catch` actuales captura esto — solo capturas `ExcepcionDominio` específicamente. Esa excepción **no controlada** sigue su curso hacia arriba, y en ASP.NET Core:

- **En ambiente Development** (que es donde probablemente estás probando ahora mismo): ASP.NET Core activa automáticamente una página de excepción detallada que **sí muestra el stack trace completo** en la respuesta.
- **En ambiente Production**: por defecto ASP.NET Core sí oculta el detalle, pero solo si está bien configurado — y devuelve un 500 genérico sin `ProblemDetails` consistente con el resto de tu API (rompe el contrato igual, aunque no filtre información).

## La solución: middleware global de excepciones (el pendiente real del Día 11)

Vamos a capturar **cualquier excepción no controlada** en un solo lugar, para que nunca llegue a exponerse un stack trace, sin importar qué falle.

### 1. Crear el middleware

`Ordenes.Api/Middlewares/ManejadorExcepcionesMiddleware.cs`:

```csharp
using Microsoft.AspNetCore.Mvc;
using System.Text.Json;

namespace Ordenes.Api.Middlewares;

public class ManejadorExcepcionesMiddleware
{
    private readonly RequestDelegate _siguiente;
    private readonly ILogger<ManejadorExcepcionesMiddleware> _logger;
    private readonly IWebHostEnvironment _entorno;

    public ManejadorExcepcionesMiddleware(
        RequestDelegate siguiente,
        ILogger<ManejadorExcepcionesMiddleware> logger,
        IWebHostEnvironment entorno)
    {
        _siguiente = siguiente;
        _logger = logger;
        _entorno = entorno;
    }

    public async Task InvokeAsync(HttpContext contexto)
    {
        try
        {
            await _siguiente(contexto);
        }
        catch (Exception ex)
        {
            // El stack trace SÍ se registra en logs internos (para que tú lo veas)
            _logger.LogError(ex, "Error no controlado procesando {Metodo} {Ruta}",
                contexto.Request.Method, contexto.Request.Path);

            contexto.Response.ContentType = "application/problem+json";
            contexto.Response.StatusCode = StatusCodes.Status500InternalServerError;

            var problemDetails = new ProblemDetails
            {
                Title = "Error Interno del Servidor",
                Status = StatusCodes.Status500InternalServerError,
                // Solo mostramos el detalle real en Development, nunca en Production
                Detail = _entorno.IsDevelopment()
                    ? ex.ToString()
                    : "Ocurrió un error inesperado. Contacta al administrador si el problema persiste."
            };

            var json = JsonSerializer.Serialize(problemDetails);
            await contexto.Response.WriteAsync(json);
        }
    }
}
```

**Punto clave:** el stack trace real (`ex.ToString()`) **sí se guarda en tus logs** (`_logger.LogError`), donde tú como desarrollador lo necesitas para diagnosticar. Solo se **oculta al consumidor externo** de la API. Esa es la distinción importante: no pierdes información para depurar, solo dejas de filtrarla hacia afuera.

### 2. Registrar el middleware en Program.cs

Debe ir **lo más arriba posible** en el pipeline, para capturar errores de todo lo que viene después:

```csharp
var app = builder.Build();

app.UseMiddleware<ManejadorExcepcionesMiddleware>(); // <-- primero que todo

app.UsarSwaggerPersonalizado();
app.UseHttpsRedirection();
app.UseCors("PermitirAngular");
app.UseAuthorization();
app.MapControllers();

app.Run();
```

### 3. Probar que funciona

Para verificarlo rápido, provoca un error no controlado a propósito. Por ejemplo, temporalmente en algún endpoint:

```csharp
[HttpGet("probar-error")]
public IActionResult ProbarError()
{
    throw new InvalidOperationException("Error de prueba simulado");
}
```

Pruébalo en Swagger — deberías recibir:

```json
{
  "title": "Error Interno del Servidor",
  "status": 500,
  "detail": "Ocurrió un error inesperado. Contacta al administrador si el problema persiste."
}
```

En vez del stack trace completo. Borra el endpoint de prueba después.

## Respuesta directa a tu pregunta

**¿Ya lo hacemos?** Parcialmente — tus errores de negocio (`ExcepcionDominio`) sí están protegidos gracias al Result pattern. **¿Debemos hacerlo?** Sí, para el resto: cualquier fallo inesperado (base de datos caída, bugs, excepciones de librerías externas) todavía puede filtrar información sensible si no agregas este middleware.

¿Compiló bien el middleware y viste el `ProblemDetails` genérico al forzar el error de prueba?

Son tres controles de seguridad distintos que suelen confundirse porque los tres "protegen" tu API, pero cada uno responde una pregunta diferente y actúa en un momento distinto del flujo. Te lo explico con ejemplos exactos de tu proyecto.

## Las tres preguntas que responde cada uno

| Concepto | Pregunta que responde |
|---|---|
| **Validación** | ¿Estos datos tienen la forma/reglas correctas? |
| **Sanitización** | ¿Estos datos son seguros de usar/mostrar tal cual vienen? |
| **Autorización** | ¿Esta persona tiene permiso de hacer esto? |

## 1. Validación — "¿Los datos son correctos?"

Verifica que los datos cumplan reglas de formato y de negocio, **sin importar quién los envía**.

Ya la tienes por todos lados en tu proyecto:

```csharp
// Validación de formato/rango (Value Objects del dominio)
public static CantidadProducto Crear(int valor)
{
    if (valor <= 0)
    {
        throw new ExcepcionDominio("La cantidad debe ser mayor a cero.");
    }
    return new CantidadProducto(valor);
}
```

```csharp
// Validación de regla de negocio
if (listaItems.Count == 0)
{
    throw new ExcepcionDominio("La orden debe tener al menos un producto.");
}
```

**Responde:** "¿Cantidad = -5 tiene sentido? No, rechazado." "¿Una orden sin ítems es válida? No, rechazada."

**Nunca modifica el dato** — solo lo acepta o lo rechaza.

## 2. Sanitización — "¿Es seguro usar/mostrar este dato tal cual?"

Limpia o neutraliza contenido potencialmente peligroso **antes de usarlo o mostrarlo**, incluso si "técnicamente" es un dato válido en formato.

Ejemplo con tu `Producto.Nombre`:

```csharp
public static Producto Crear(string nombre, decimal precio, int stockInicial)
{
    if (string.IsNullOrWhiteSpace(nombre))
    {
        throw new ExcepcionDominio("El nombre del producto es obligatorio.");
    }
    return new Producto(Guid.NewGuid(), nombre.Trim(), ...);
}
```

`nombre.Trim()` es una sanitización mínima (quita espacios). Pero imagina que alguien envía como nombre:

```
<script>alert('hackeado')</script>
```

Esto **pasa tu validación actual** sin problema (no está vacío, es texto válido). El dato es "válido" en forma, pero **peligroso** si Angular luego lo muestra directamente en el HTML sin escaparlo — ahí es donde ocurre un **XSS** (Cross-Site Scripting), justo lo que menciona el Día 2 de tu plan.

**La sanitización correcta acá tiene dos capas:**

- **Backend:** podrías rechazar o limpiar caracteres HTML peligrosos del nombre antes de guardarlo
- **Frontend (la más importante):** Angular **ya sanitiza automáticamente** por defecto cuando usas interpolación normal:
```html
<td mat-cell *matCellDef="let producto">{{ producto.nombre }}</td>
```
Angular escapa esto automáticamente — no ejecuta el `<script>`, lo muestra como texto plano. **El riesgo aparece si alguien usa `[innerHTML]` sin cuidado:**
```html
<!-- ⚠️ Peligroso si el dato no está sanitizado -->
<div [innerHTML]="producto.nombre"></div>
```
Esto sí ejecutaría el script. Por eso el Día 2 de tu plan pregunta: *"¿Por qué Angular no debe confiar en datos provenientes del backend sin validación?"* — la respuesta es exactamente esta.

**Diferencia clave con validación:** la validación **rechaza** datos malos; la sanitización **transforma/neutraliza** datos que técnicamente "pasan" pero son riesgosos en otro contexto (HTML, SQL, sistema de archivos).

## 3. Autorización — "¿Esta persona puede hacer esto?"

No se trata de si el dato es correcto — se trata de **quién** está pidiendo la acción y si tiene permiso, **incluso con datos perfectamente válidos**.

Ejemplo futuro en tu proyecto (Día 12, JWT):

```csharp
[Authorize(Roles = "Admin")]
[HttpDelete("{id}")]
public async Task<ActionResult> Eliminar(Guid id)
{
    // Solo un Admin puede llegar aquí, sin importar si el id es válido
}
```

Aquí el `id` puede ser perfectamente válido (existe, tiene formato correcto), pero si quien hace la petición es un `Viewer` en vez de un `Admin`, la petición se rechaza **antes** de que le importe si el dato es válido o no.

**Autenticación vs Autorización** (para no mezclar un cuarto concepto):
- **Autenticación:** ¿sabemos quién eres? (login, JWT válido)
- **Autorización:** ya sabiendo quién eres, ¿tienes permiso para *esto*? (rol, política)

## Cómo se relacionan los tres en un solo request (orden típico)

Imagina: `PUT /api/v1/Productos/{id}` con body `{ "nombre": "<script>...</script>", "precio": -10 }`, enviado por un usuario con rol `Viewer`.

```
1. Autorización   → ¿Viewer puede actualizar productos? NO → 403 Forbidden (ni siquiera llega a validar el body)

   (si fuera Admin, continuaría:)

2. Validación     → ¿precio = -10 es válido? NO → 400 Bad Request (Error.Validacion)

   (si el precio fuera válido:)

3. Sanitización   → ¿el nombre con <script> es seguro de guardar/mostrar? 
                     Se neutraliza o se rechaza antes de persistir/renderizar
```

El orden real más común es: **Autorización primero** (no vale la pena procesar nada si no tiene permiso), luego **Validación** (¿la forma del dato tiene sentido?), y la **Sanitización** ocurre tanto al guardar como, especialmente, al mostrar el dato de vuelta.

## Resumen en una frase para cada uno

- **Validación:** "Este dato no cumple las reglas, lo rechazo." (`ExcepcionDominio`, `Result.Fallo`)
- **Sanitización:** "Este dato cumple las reglas, pero podría ser peligroso — lo limpio o lo trato con cuidado antes de usarlo." (Angular interpolation, evitar `innerHTML` sin control)
- **Autorización:** "No importa si el dato es válido — esta persona no tiene permiso para hacer esto." (`[Authorize(Roles = "...")]`, próximo Día 12)

¿Quieres que revisemos ahora mismo si `Producto.Nombre` u `Orden` tienen algún campo de texto libre donde valga la pena agregar una sanitización más estricta antes de seguir con JWT (Día 12)?

Dos preguntas del Día 2 de tu plan, y ambas se conectan directamente con código que ya tienes. Vamos una por una.

## 1. Cómo ayuda Entity Framework a prevenir SQL Injection

## Qué es SQL Injection (el problema que resuelve)

Ocurre cuando un dato que viene del usuario se concatena directamente dentro de una consulta SQL como texto, sin separarlo del código. Ejemplo de lo que **NUNCA** se debe hacer (SQL crudo concatenado):

```csharp
// ❌ VULNERABLE — nunca hagas esto
var sql = $"SELECT * FROM Productos WHERE Nombre = '{nombreBuscado}'";
```

Si alguien envía como `nombreBuscado`:
```
' OR '1'='1
```

La consulta se convierte en:
```sql
SELECT * FROM Productos WHERE Nombre = '' OR '1'='1'
```

Eso devuelve **todos** los productos, ignorando el filtro — y con variantes más agresivas (`'; DROP TABLE Productos; --`), un atacante puede borrar tablas completas o extraer datos que no debería ver.

## Cómo EF Core te protege de esto automáticamente

Tu código ya usa **LINQ**, nunca SQL concatenado a mano:

```csharp
public async Task<Producto?> ObtenerPorIdAsync(Guid id, CancellationToken cancellationToken = default)
{
    return await _contexto.Productos
        .FirstOrDefaultAsync(producto => producto.Id == id, cancellationToken);
}
```

Cuando EF Core traduce esto a SQL real, **no concatena el valor de `id` como texto** — lo envía como un **parámetro separado**:

```sql
SELECT TOP(1) [p].[Id], [p].[Nombre], ...
FROM [Productos] AS [p]
WHERE [p].[Id] = @__id_0
```

`@__id_0` es un parámetro real de SQL Server, enviado por separado del texto de la consulta. El motor de base de datos sabe con certeza: "esto es un **valor de dato**, no código SQL ejecutable" — sin importar qué texto contenga. Aunque `id` contuviera algo como `'; DROP TABLE Productos; --`, SQL Server lo trataría como un simple valor de texto a comparar, nunca como instrucción.

## Dónde SÍ podrías romper esta protección (para que sepas qué evitar)

EF Core te protege **mientras uses LINQ**. Si alguna vez usas SQL crudo con `FromSqlRaw` concatenando strings, vuelves a estar expuesto:

```csharp
// ❌ Esto SÍ sería vulnerable, incluso usando EF Core
_contexto.Productos.FromSqlRaw($"SELECT * FROM Productos WHERE Nombre = '{nombreBuscado}'");
```

```csharp
// ✅ Esto es seguro (parametrizado correctamente)
_contexto.Productos.FromSqlInterpolated($"SELECT * FROM Productos WHERE Nombre = {nombreBuscado}");
```

`FromSqlInterpolated` (con la sintaxis `$"..."`) sí parametriza automáticamente, a diferencia de `FromSqlRaw` con concatenación manual.

**Tu proyecto está seguro ahora mismo** porque nunca has usado SQL crudo — todo pasa por LINQ (`Where`, `FirstOrDefaultAsync`, etc.), que siempre parametriza.

---

## 2. Por qué Angular no debe confiar en datos de la API sin validarlos

Esto conecta con lo que hablamos de sanitización, pero aquí el ángulo es distinto: no es sobre datos que **envías** a la API, sino sobre datos que **recibes** de ella.

## La idea errónea común

"Si el dato ya pasó por mi backend con Clean Architecture, dominio validado, EF Core parametrizado... ¿por qué no confiar en lo que me devuelve?"

## Por qué esa confianza es un error, con 3 razones concretas

**Razón 1: El backend no es la única fuente de la verdad para Angular**

Angular no sabe (ni debería asumir) que **siempre** habla con tu API real. Podría estar hablando con:
- Un backend comprometido (si alguien vulneró tu servidor)
- Un proxy intermedio modificado
- Un ataque de tipo Man-in-the-Middle si HTTPS estuviera mal configurado
- Datos corruptos por un bug en tu propio backend

Angular no puede verificar "confío ciegamente en que este JSON es 100% seguro" solo porque viene de una URL que tú controlas.

**Razón 2: Datos válidos en tu dominio no son automáticamente seguros para el DOM**

Aquí está la conexión directa con lo que vimos de sanitización. Imagina este escenario real en tu proyecto:

```csharp
// Tu backend valida esto correctamente como "válido"
public static Producto Crear(string nombre, decimal precio, int stockInicial)
{
    if (string.IsNullOrWhiteSpace(nombre)) { throw ... }
    return new Producto(Guid.NewGuid(), nombre.Trim(), ...);
}
```

`nombre = "<img src=x onerror=alert('hackeado')>"` **pasa perfectamente** esta validación — no está vacío, es texto válido. Tu backend lo guarda sin problema, y se lo devuelve a Angular tal cual en `ProductoResponse`.

**El backend hizo su trabajo correctamente** (validó que hubiera un nombre). Pero ese nombre, al llegar a Angular, sigue siendo peligroso **si Angular lo trata sin cuidado**:

```html
<!-- ❌ Peligroso: si en algún componente usas esto -->
<div [innerHTML]="producto.nombre"></div>
```

Esto ejecutaría el `onerror` y correría JavaScript arbitrario en el navegador de quien esté viendo esa pantalla — un ataque **XSS almacenado** (porque el dato malicioso quedó guardado en tu base de datos, esperando a que alguien lo visualice).

**Razón 3: Angular no controla qué pasó "en el camino"**

Aunque confíes 100% en tu propio backend hoy, mañana:
- Alguien agrega un nuevo endpoint sin las mismas validaciones
- Un compañero de equipo escribe una consulta que no pasa por el dominio
- Se integra un tercero que también escribe a la misma base de datos

Angular, como capa de presentación, **no puede asumir** que todos esos caminos futuros siempre validaron correctamente.

## Cómo Angular se protege en la práctica (lo que ya tienes, y lo que deberías reforzar)

**Ya te protege por defecto (interpolación estándar):**
```html
{{ producto.nombre }}
```
Angular **siempre** escapa esto automáticamente — convierte `<script>` en texto plano visible, nunca lo ejecuta. Esta es tu defensa principal, y ya la usas en tus tablas (`productos-lista.component.html`, `ordenes-lista.component.html`).

**El peligro real solo aparece si usas explícitamente:**
```html
[innerHTML]="algo"
[innerText] no es peligroso, pero [innerHTML] sí, si el contenido no está sanitizado
bypassSecurityTrustHtml(...) — esto le dice a Angular "confía en esto ciegamente", úsalo solo si tú mismo generaste el HTML, nunca con datos externos
```

**Revisemos tu proyecto:** en ningún componente que hemos creado hasta ahora (`productos-lista`, `ordenes-lista`, formularios) usaste `[innerHTML]` — todo usa interpolación `{{ }}` normal. Estás bien protegido en este punto actual del proyecto. ✅

## Resumen de ambas respuestas

- **EF Core previene SQL Injection** porque traduce LINQ a SQL parametrizado automáticamente — el dato del usuario nunca se mezcla como código ejecutable con la consulta, siempre y cuando no uses `FromSqlRaw` con concatenación manual.
- **Angular no debe confiar en datos de la API** porque "válido según las reglas de negocio" no es lo mismo que "seguro de insertar directamente en el DOM" — la validación del backend y la sanitización del frontend resuelven problemas distintos, y Angular necesita su propia defensa (que ya tiene por defecto con interpolación, mientras evites `[innerHTML]` sin control).

¿Quieres que revisemos juntos si en algún punto futuro del proyecto (por ejemplo, si agregas una vista de "detalle de producto" más elaborada) valdría la pena usar `[innerHTML]` con `DomSanitizer` para permitir texto enriquecido controlado (ej. descripciones con negritas), o prefieres seguir con el Día 11 (FluentValidation, CORS, health checks)?