# Arquitectura de Plataforma de Órdenes

## Índice
1. [Visión General](#visión-general)
2. [Estructura del Proyecto](#estructura-del-proyecto)
3. [Patrones y Principios](#patrones-y-principios)
4. [Descripción de Capas](#descripción-de-capas)
5. [Flujo de Datos](#flujo-de-datos)
6. [Tecnologías](#tecnologías)
7. [Configuración de Dependencias](#configuración-de-dependencias)

---

## Visión General

**Plataforma de Órdenes** es una aplicación backend desarrollada en **ASP.NET Core 8** que implementa una arquitectura de **capas limpias (Clean Architecture)** con principios de **Domain-Driven Design (DDD)**.

El sistema permite:
- Crear y gestionar órdenes de clientes
- Administrar productos disponibles
- Consultar órdenes con sus items asociados
- Persistencia de datos mediante Entity Framework Core

### Características Técnicas
- ✅ .NET 8
- ✅ Entity Framework Core con SQL Server
- ✅ Inyección de dependencias
- ✅ DTOs para separación de responsabilidades
- ✅ Manejo de excepciones de dominio
- ✅ Operaciones asincrónicas
- ✅ Documentación con Swagger/OpenAPI

---

## Estructura del Proyecto

```
src/
├── Ordenes.Dominio/              # Capa de Dominio (DDD)
│   ├── Entidades/
│   │   ├── Orden.cs
│   │   ├── Producto.cs
│   │   └── ItemOrden.cs
│   ├── ObjetosValor/
│   │   ├── Dinero.cs
│   │   └── CantidadProducto.cs
│   └── Excepciones/
│       └── ExcepcionDominio.cs
│
├── Ordenes.Aplicacion/           # Capa de Aplicación
│   ├── CasosUso/                 # Handlers de casos de uso
│   │   ├── CrearOrdenHandler.cs
│   │   ├── ConsultarOrdenConItemsPorIdHeadler.cs
│   │   ├── CrearProductoHandler.cs
│   │   ├── ConsultarProductosHandler.cs
│   │   └── ConsultarProductoPorId.cs
│   ├── DTOs/                     # Data Transfer Objects
│   │   ├── Orden/
│   │   │   ├── CrearOrdenRequest.cs
│   │   │   ├── OrdenResponse.cs
│   │   │   └── ItemOrdenDTO.cs
│   │   └── Producto/
│   │       ├── ProductoRequest.cs
│   │       └── ProductoResponse.cs
│   ├── Interfaces/               # Contratos de repositorios
│   │   ├── IRepositorioOrdenes.cs
│   │   └── IRepositorioProductos.cs
│   └── Mapeador/
│       └── OrdenMapeador.cs
│
├── Ordenes.Infraestructura/      # Capa de Infraestructura
│   ├── Persistencia/
│   │   ├── Db/
│   │   │   ├── OrdenesDbContexto.cs       # DbContext
│   │   │   ├── RepositorioOrdenesEfCore.cs
│   │   │   └── RepositorioProductosEfCore.cs
│   │   ├── Configuraciones/               # Configuración de EF
│   │   │   ├── OrdenConfiguracion.cs
│   │   │   ├── ItemOrdenConfiguracion.cs
│   │   │   └── ProductoConfiguracion.cs
│   │   ├── RepositorioOrdenesMemoria.cs   # Implementación alternativa
│   │   └── Migrations/
│   │       ├── 20260716213546_InitialCreate.cs
│   │       └── 20260717160933_AgregarProductos.cs
│
├── Ordenes.Api/                  # Capa de Presentación (API)
│   ├── Controllers/
│   │   ├── OrdenesController.cs
│   │   └── ProductosController.cs
│   ├── Extensiones/
│   │   └── SwaggerExtensions.cs
│   └── Program.cs
│
tests/
├── Ordenes.PruebasUnitarias/     # Pruebas unitarias
└── Ordenes.PruebasIntegracion/   # Pruebas de integración
```

---

## Patrones y Principios

### 1. **Clean Architecture (Arquitectura Limpia)**
Cada capa tiene responsabilidades claramente definidas y depende de abstracciones:

```
┌─────────────────────────────────┐
│     Presentación (API)          │  Controllers, DTOs
├─────────────────────────────────┤
│     Aplicación (CasosUso)       │  Handlers, Mapeadores
├─────────────────────────────────┤
│     Dominio (Entidades)         │  Lógica de negocio
├─────────────────────────────────┤
│     Infraestructura (Datos)     │  BD, Repositorios
└─────────────────────────────────┘
```

### 2. **Domain-Driven Design (DDD)**
- **Entidades**: Objetos con identidad única (Orden, Producto)
- **Objetos Valor**: Objetos sin identidad que representan valores (Dinero, CantidadProducto)
- **Agregados**: Orden es el agregado raíz que gestiona sus ItemOrden
- **Excepciones de Dominio**: ExcepcionDominio para errores de negocio

### 3. **SOLID Principles**
- **S**ingle Responsibility: Cada clase tiene una responsabilidad única
- **O**pen/Closed: Abierto para extensión (nuevos handlers), cerrado para modificación
- **L**iskov Substitution: Repositorios intercambiables (EfCore ↔ Memoria)
- **I**nterface Segregation: Interfaces específicas por repositorio
- **D**ependency Inversion: Dependencia en abstracciones (IRepositorio)

### 4. **Handler Pattern**
Cada caso de uso es manejado por un Handler:
```csharp
CrearOrdenHandler → Procesa CrearOrdenRequest → Retorna OrdenResponse
ConsultarOrdenConItemsPorIdHeadler → Obtiene orden con sus items
```

### 5. **Data Transfer Objects (DTOs)**
Desacopla la API de la lógica de dominio:
- `CrearOrdenRequest` → Input
- `OrdenResponse` → Output
- Mapeo mediante `OrdenMapeador`

---

## Descripción de Capas

### 🎯 **1. Capa de Dominio** (`Ordenes.Dominio`)
**Responsabilidad**: Contiene la lógica de negocio y reglas del dominio.

**Componentes principales**:

#### Entidades
```csharp
// Orden - Agregado Raíz
public sealed class Orden
{
    public Guid Id { get; }
    public Guid ClienteId { get; }
    public DateTime FechaCreacion { get; }
    public IReadOnlyCollection<ItemOrden> Items => _items.AsReadOnly();

    // Lógica de dominio
    public static Orden Crear(Guid id, IEnumerable<ItemOrden> items) { ... }
    public Dinero CalcularTotal() { ... }
}

// Producto
public sealed class Producto
{
    public Guid Id { get; }
    public string Nombre { get; }
    public Dinero Precio { get; }
}

// ItemOrden - Parte del agregado Orden
public class ItemOrden
{
    public Guid Id { get; }
    public Guid ProductoId { get; }
    public CantidadProducto Cantidad { get; }
    public Dinero PrecioUnitario { get; }
}
```

#### Objetos Valor
```csharp
// Dinero - Objeto Valor
public sealed record Dinero(decimal Valor, string Moneda = "COP")
{
    public Dinero Sumar(Dinero otro) => new(Valor + otro.Valor, Moneda);
    public static Dinero Cero => new(0);
}

// CantidadProducto - Objeto Valor
public sealed record CantidadProducto(int Valor)
{
    // Validaciones
}
```

#### Excepciones
```csharp
public class ExcepcionDominio : Exception
{
    // Excepciones específicas de negocio
}
```

**Independencia**: ✅ No depende de ninguna otra capa.

---

### 📋 **2. Capa de Aplicación** (`Ordenes.Aplicacion`)
**Responsabilidad**: Orquesta la lógica de dominio y coordina las operaciones.

**Componentes principales**:

#### Handlers (Casos de Uso)
```csharp
// Crear Orden
public class CrearOrdenHandler
{
    public async Task<OrdenResponse> HandleAsync(
        CrearOrdenRequest request, CancellationToken cancellationToken) { ... }
}

// Consultar Orden con Items
public class ConsultarOrdenConItemsPorIdHeadler
{
    public async Task<OrdenResponse> HandleAsync(
        Guid ordenId, CancellationToken cancellationToken) { ... }
}
```

#### DTOs (Data Transfer Objects)
```csharp
// Request
public record CrearOrdenRequest(
    List<ItemOrdenDTO> Items
);

// Response
public record OrdenResponse(
    Guid Id,
    Guid ClienteId,
    DateTime FechaCreacion,
    List<ItemOrdenResponse> Items,
    decimal Total
);
```

#### Interfaces de Repositorios
```csharp
public interface IRepositorioOrdenes
{
    Task GuardarAsync(Orden orden, CancellationToken cancellationToken);
    Task<Orden?> ObtenerPorIdAsync(Guid id, CancellationToken cancellationToken);
    Task<Orden?> ObtenerConItemsPorIdAsync(Guid ordenId, CancellationToken cancellationToken);
    Task<List<Orden>> ObtenerTodosAsync(CancellationToken cancellationToken);
}
```

#### Mapeador
```csharp
public class OrdenMapeador
{
    // Mapea Orden → OrdenResponse
    // Mapea CrearOrdenRequest → ItemOrden
}
```

**Dependencias**: Dominio ✅

---

### 🔧 **3. Capa de Infraestructura** (`Ordenes.Infraestructura`)
**Responsabilidad**: Implementa acceso a datos y dependencias externas.

**Componentes principales**:

#### DbContext (Entity Framework Core)
```csharp
public class OrdenesDbContexto : DbContext
{
    public DbSet<Orden> Ordenes => Set<Orden>();
    public DbSet<Producto> Productos => Set<Producto>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        // Aplica configuraciones de entidades
        modelBuilder.ApplyConfigurationsFromAssembly(
            typeof(OrdenesDbContexto).Assembly);
    }
}
```

#### Repositorios
```csharp
// Implementación con EF Core (SQL Server)
public class RepositorioOrdenesEfCore : IRepositorioOrdenes
{
    private readonly OrdenesDbContexto _dbContexto;

    public async Task<Orden?> ObtenerConItemsPorIdAsync(
        Guid ordenId, CancellationToken cancellationToken) { ... }
}

// Implementación en Memoria (alternativa para pruebas)
public class RepositorioOrdenesMemoria : IRepositorioOrdenes { ... }
```

#### Configuraciones de Entidades
```csharp
// Fluent API configuration
public class OrdenConfiguracion : IEntityTypeConfiguration<Orden>
{
    public void Configure(EntityTypeBuilder<Orden> builder)
    {
        builder.HasKey(o => o.Id);
        builder.HasMany(o => o.Items)
               .WithOne(i => i.Orden)
               .HasForeignKey("OrdenId");
    }
}
```

#### Migraciones
```
20260716213546_InitialCreate.cs      → Tabla de Órdenes, Items
20260717160933_AgregarProductos.cs   → Tabla de Productos
```

**Dependencias**: Dominio, Aplicación ✅

---

### 🌐 **4. Capa de Presentación (API)** (`Ordenes.Api`)
**Responsabilidad**: Expone endpoints HTTP para consumo de clientes.

**Componentes principales**:

#### Controllers
```csharp
[ApiController]
[Route("api/[controller]")]
public class OrdenesController : ControllerBase
{
    // POST /api/ordenes - Crear orden
    [HttpPost]
    public async Task<ActionResult<OrdenResponse>> Crear(
        CrearOrdenRequest request, CancellationToken cancellationToken)

    // GET /api/ordenes/{id} - Obtener orden con items
    [HttpGet("{id}")]
    public async Task<ActionResult<OrdenResponse>> ObtenerConItemPorId(
        Guid id, CancellationToken cancellationToken)
}

[ApiController]
[Route("api/[controller]")]
public class ProductosController : ControllerBase
{
    // POST, GET, etc.
}
```

#### Configuración de Swagger
```csharp
public static class SwaggerExtensions
{
    public static IServiceCollection AddSwaggerDocumentation(
        this IServiceCollection services)
    {
        // Configuración de OpenAPI
    }
}
```

**Dependencias**: Aplicación ✅

---

## Flujo de Datos

### Ejemplo: Crear una Orden

```
┌──────────────────────────────────────────────────────────────┐
│ 1. CLIENTE HTTP                                              │
│    POST /api/ordenes                                         │
│    {                                                         │
│      "items": [                                              │
│        {"productoId": "...", "cantidad": 2, "precio": 100}  │
│      ]                                                       │
│    }                                                         │
└──────────────────────────────────────────┬──────────────────┘
                                           │
┌──────────────────────────────────────────▼──────────────────┐
│ 2. PRESENTACIÓN (OrdenesController)                         │
│    ├─ Recibe CrearOrdenRequest (DTO)                        │
│    ├─ Valida entrada                                        │
│    └─ Invoca CrearOrdenHandler                              │
└──────────────────────────────────────────┬──────────────────┘
                                           │
┌──────────────────────────────────────────▼──────────────────┐
│ 3. APLICACIÓN (CrearOrdenHandler)                           │
│    ├─ Mapea CrearOrdenRequest → ItemOrden (Dominio)        │
│    ├─ Invoca Orden.Crear() (Lógica de Negocio)            │
│    ├─ Invoca IRepositorioOrdenes.GuardarAsync()            │
│    └─ Mapea Orden → OrdenResponse (DTO)                    │
└──────────────────────────────────────────┬──────────────────┘
                                           │
┌──────────────────────────────────────────▼──────────────────┐
│ 4. INFRAESTRUCTURA (RepositorioOrdenesEfCore)              │
│    ├─ Recibe entidad Orden (Dominio)                       │
│    ├─ Usa DbContext para persistencia                      │
│    └─ SQL INSERT → SQL Server                              │
└──────────────────────────────────────────┬──────────────────┘
                                           │
┌──────────────────────────────────────────▼──────────────────┐
│ 5. BASE DE DATOS                                            │
│    Orden + ItemOrden guardados                             │
└──────────────────────────────────────────┬──────────────────┘
                                           │
┌──────────────────────────────────────────▼──────────────────┐
│ 6. RESPUESTA HTTP                                           │
│    201 Created                                              │
│    {                                                        │
│      "id": "...",                                           │
│      "clienteId": "...",                                    │
│      "fechaCreacion": "...",                                │
│      "items": [...],                                        │
│      "total": 200                                           │
│    }                                                        │
└──────────────────────────────────────────────────────────────┘
```

### Ejemplo: Consultar Orden con Items

```
GET /api/ordenes/{id}
        │
        ▼
OrdenesController.ObtenerConItemPorId()
        │
        ▼
ConsultarOrdenConItemsPorIdHeadler.HandleAsync()
        │
        ▼
IRepositorioOrdenes.ObtenerConItemsPorIdAsync()
        │
        ▼
RepositorioOrdenesEfCore (SQL Server)
    SELECT Orden WITH Include(Items)
        │
        ▼
Mapea Orden → OrdenResponse
        │
        ▼
HTTP 200 OK
```

---

## Tecnologías

| Componente | Tecnología | Versión |
|-----------|-----------|---------|
| Framework | ASP.NET Core | 8.0 |
| ORM | Entity Framework Core | 8.x |
| Base de Datos | SQL Server | Compatible |
| Inyección DI | Microsoft.Extensions.DependencyInjection | Built-in |
| API Documentation | Swagger/OpenAPI | Built-in |
| Testing | xUnit / nUnit | (Configurado) |
| Lenguaje | C# | 12 |

---

## Configuración de Dependencias

### `Program.cs` - Inyección de Dependencias

```csharp
// DbContext
builder.Services.AddDbContext<OrdenesDbContexto>(options =>
{
    options.UseSqlServer(
        builder.Configuration.GetConnectionString("DefaultConnection"));
});

// Repositorios (patrón Strategy)
// Opción 1: Memoria (pruebas/desarrollo)
// builder.Services.AddSingleton<IRepositorioOrdenes, RepositorioOrdenesMemoria>();

// Opción 2: EF Core / SQL Server (producción)
builder.Services.AddScoped<IRepositorioOrdenes, RepositorioOrdenesEfCore>();
builder.Services.AddScoped<IRepositorioProductos, RepositorioProductosEfCore>();

// Handlers (Casos de Uso)
builder.Services.AddScoped<CrearOrdenHandler>();
builder.Services.AddScoped<ConsultarOrdenConItemsPorIdHeadler>();
builder.Services.AddScoped<CrearProductoHandler>();
builder.Services.AddScoped<ConsultarProductosHandler>();
builder.Services.AddScoped<ConsultarProductoPorIdHandler>();

// API
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerDocumentation();
```

### `appsettings.json` - Configuración

```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Server=.;Database=OrdenesDb;Trusted_Connection=true;"
  }
}
```

---

## Ventajas de esta Arquitectura

✅ **Separación de Responsabilidades**: Cada capa tiene un propósito claro  
✅ **Testabilidad**: Fácil de probar con mocks/stubs  
✅ **Mantenibilidad**: Código organizado y escalable  
✅ **Flexibilidad**: Cambiar de SQL Server a otra BD sin afectar dominio  
✅ **Reutilización**: Handlers y Repositorios reutilizables  
✅ **DDD**: Lógica de negocio expresiva y testeable  
✅ **Escalabilidad**: Fácil agregar nuevos casos de uso  

---

## Próximos Pasos Recomendados

1. **Validaciones**: Agregar FluentValidation para DTOs
2. **Logging**: Implementar logging estructurado (Serilog)
3. **CQRS**: Separar lecturas de escrituras si crece la complejidad
4. **EventSourcing**: Auditoría de cambios en órdenes
5. **Autenticación**: Agregar autenticación y autorización
6. **Rate Limiting**: Proteger endpoints con rate limiting
7. **Caché**: Implementar caché para consultas frecuentes
8. **GraphQL**: Considerar GraphQL además de REST API

---

## Referencias

- [Clean Architecture - Robert C. Martin](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- [Domain-Driven Design - Eric Evans](https://www.domainlanguage.com/ddd/)
- [Entity Framework Core Documentation](https://docs.microsoft.com/en-us/ef/core/)
- [ASP.NET Core Best Practices](https://docs.microsoft.com/en-us/aspnet/core/fundamentals/best-practices)

---

**Última actualización**: 2025-01-01  
**Versión**: 1.0  
**Autor**: Equipo de Desarrollo