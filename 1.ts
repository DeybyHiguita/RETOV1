Vamos con la actividad práctica del **Día 4** — programación funcional aplicada al dominio. La idea central: funciones que no modifican estado externo, siempre devuelven lo mismo dado el mismo input, y se pueden combinar entre sí.

## 1. Objeto de valor: OrdenId (te faltaba este)

Ya tienes `Dinero` y `CantidadProducto`, pero el `Id` de `Orden` sigue siendo un `Guid` suelto. Vamos a encapsularlo como Value Object — es una práctica común para evitar "obsesión primitiva" (usar tipos primitivos donde deberías tener un concepto de dominio).

`Ordenes.Dominio/ObjetosDeValor/OrdenId.cs`:

```csharp
namespace Ordenes.Dominio.ObjetosDeValor;

public sealed record OrdenId
{
    public Guid Valor { get; }

    private OrdenId(Guid valor)
    {
        Valor = valor;
    }

    public static OrdenId Nuevo() => new(Guid.NewGuid());

    public static OrdenId Desde(Guid valor)
    {
        if (valor == Guid.Empty)
        {
            throw new Excepciones.ExcepcionDominio("El identificador de la orden no puede estar vacío.");
        }

        return new OrdenId(valor);
    }

    public override string ToString() => Valor.ToString();
}
```

**Nota:** No voy a forzar el cambio de `Orden.Id` de `Guid` a `OrdenId` ahora mismo porque eso implica tocar EF Core (configuración, migraciones) y todos los DTOs — es un cambio grande para solo una actividad práctica. Lo dejamos disponible como Value Object aprendido; si quieres migrarlo en serio después, lo hacemos con cuidado.

## 2. Agregar Categoria a Producto (necesario para "agrupar por categoría")

Tu `Producto` actual no tiene categoría. Vamos a agregarla mínimamente.

En `Producto.cs`, agrega la propiedad y ajusta el método `Crear`:

```csharp
public sealed class Producto
{
    public Guid Id { get; }
    public string Nombre { get; private set; }
    public Dinero Precio { get; private set; }
    public int Stock { get; private set; }
    public string Categoria { get; private set; }

    private Producto(Guid id, string nombre, Dinero precio, int stock, string categoria)
    {
        Id = id;
        Nombre = nombre;
        Precio = precio;
        Stock = stock;
        Categoria = categoria;
    }

    public static Producto Crear(string nombre, decimal precio, int stockInicial, string categoria)
    {
        if (string.IsNullOrWhiteSpace(nombre))
        {
            throw new ExcepcionDominio("El nombre del producto es obligatorio.");
        }

        if (string.IsNullOrWhiteSpace(categoria))
        {
            throw new ExcepcionDominio("La categoría del producto es obligatoria.");
        }

        if (stockInicial < 0)
        {
            throw new ExcepcionDominio("El stock inicial no puede ser negativo.");
        }

        return new Producto(Guid.NewGuid(), nombre.Trim(), Dinero.Crear(precio), stockInicial, categoria.Trim());
    }

    public bool EstaDisponible => Stock > 0;

    // ... resto de métodos igual (DescontarStock, ActualizarStock, ActualizarDatos)
}
```

Esto implica: actualizar `CrearProductoRequest`, `ProductoResponse`, `ProductoConfiguracion` (EF), el caso de uso `CrearProducto`, y crear una migración. Te lo dejo al final como checklist, para enfocarnos primero en las funciones puras que pediste.

## 3. Funciones puras: cálculo de totales, filtrado, agrupación

Creamos una clase estática con funciones puras — no dependen de estado externo, no tienen efectos secundarios, y siempre devuelven lo mismo dado el mismo input.

`Ordenes.Dominio/Funcional/OperacionesOrden.cs`:

```csharp
using Ordenes.Dominio.Entidades;
using Ordenes.Dominio.ObjetosDeValor;

namespace Ordenes.Dominio.Funcional;

public static class OperacionesOrden
{
    /// <summary>
    /// Calcula el total de una orden a partir de sus ítems, usando una función pura (Aggregate).
    /// No modifica ningún estado externo; siempre devuelve el mismo resultado para los mismos ítems.
    /// </summary>
    public static Dinero CalcularTotal(IEnumerable<ItemOrden> items)
    {
        return items.Aggregate(
            Dinero.Cero,
            (total, item) => total.Sumar(item.CalcularSubtotal()));
    }
}
```

`Ordenes.Dominio/Funcional/OperacionesProducto.cs`:

```csharp
using Ordenes.Dominio.Entidades;

namespace Ordenes.Dominio.Funcional;

public static class OperacionesProducto
{
    /// <summary>
    /// Filtra productos disponibles (con stock mayor a cero).
    /// Función pura: no modifica la colección original, devuelve una nueva.
    /// </summary>
    public static IEnumerable<Producto> FiltrarDisponibles(IEnumerable<Producto> productos)
    {
        return productos.Where(producto => producto.EstaDisponible);
    }

    /// <summary>
    /// Agrupa productos por categoría.
    /// Función pura: devuelve una nueva estructura de agrupación sin efectos secundarios.
    /// </summary>
    public static IReadOnlyDictionary<string, List<Producto>> AgruparPorCategoria(IEnumerable<Producto> productos)
    {
        return productos
            .GroupBy(producto => producto.Categoria)
            .ToDictionary(grupo => grupo.Key, grupo => grupo.ToList());
    }
}
```

## 4. Descuentos mediante funciones componibles

Aquí está la parte más "funcional" de la actividad: representar un descuento como una **función** (`Func<Dinero, Dinero>`), y poder **combinar varias** en secuencia sin que ninguna dependa de estado externo.

`Ordenes.Dominio/Funcional/Descuentos.cs`:

```csharp
using Ordenes.Dominio.ObjetosDeValor;

namespace Ordenes.Dominio.Funcional;

public static class Descuentos
{
    /// <summary>
    /// Descuento de un porcentaje fijo (ej. 0.10 = 10%).
    /// Devuelve una función pura: Dinero -> Dinero.
    /// </summary>
    public static Func<Dinero, Dinero> PorcentajeFijo(decimal porcentaje)
    {
        return dinero => Dinero.Crear(dinero.Monto - (dinero.Monto * porcentaje));
    }

    /// <summary>
    /// Descuento de un monto fijo, sin dejar el total en negativo.
    /// </summary>
    public static Func<Dinero, Dinero> MontoFijo(decimal monto)
    {
        return dinero => Dinero.Crear(Math.Max(0, dinero.Monto - monto));
    }

    /// <summary>
    /// Compone varias funciones de descuento en una sola, aplicándolas en orden.
    /// Esto es "funciones componibles": cada descuento es independiente,
    /// y se pueden encadenar sin que ninguna conozca a las demás.
    /// </summary>
    public static Func<Dinero, Dinero> Componer(params Func<Dinero, Dinero>[] descuentos)
    {
        return dinero => descuentos.Aggregate(dinero, (acumulado, descuento) => descuento(acumulado));
    }
}
```

## 5. Cómo se usarían juntas (ejemplo de uso, no necesariamente producción)

```csharp
var total = OperacionesOrden.CalcularTotal(orden.Items);

var descuentoCompuesto = Descuentos.Componer(
    Descuentos.PorcentajeFijo(0.10m),   // 10% de descuento
    Descuentos.MontoFijo(5.00m));        // luego resta 5 unidades monetarias fijas

var totalConDescuento = descuentoCompuesto(total);
```

Esto demuestra justo lo que pide el Día 4: **"aplicar descuentos mediante funciones componibles"** — cada descuento es una función independiente y pura; `Componer` las encadena sin que se conozcan entre sí, y puedes agregar/quitar descuentos sin tocar la lógica de los demás.

## 6. Pruebas unitarias de estas funciones (para validar que son puras)

`Ordenes.PruebasUnitarias/Funcional/OperacionesProductoPruebas.cs`:

```csharp
using Ordenes.Dominio.Entidades;
using Ordenes.Dominio.Funcional;
using Xunit;

namespace Ordenes.PruebasUnitarias.Funcional;

public class OperacionesProductoPruebas
{
    [Fact]
    public void DebeFiltrarSoloProductosConStockDisponible()
    {
        var productos = new List<Producto>
        {
            Producto.Crear("Teclado", 50, 10, "Periféricos"),
            Producto.Crear("Mouse", 20, 0, "Periféricos"),
            Producto.Crear("Monitor", 300, 5, "Pantallas")
        };

        var disponibles = OperacionesProducto.FiltrarDisponibles(productos).ToList();

        Assert.Equal(2, disponibles.Count);
        Assert.DoesNotContain(disponibles, p => p.Nombre == "Mouse");
    }

    [Fact]
    public void DebeAgruparProductosPorCategoria()
    {
        var productos = new List<Producto>
        {
            Producto.Crear("Teclado", 50, 10, "Periféricos"),
            Producto.Crear("Mouse", 20, 5, "Periféricos"),
            Producto.Crear("Monitor", 300, 5, "Pantallas")
        };

        var agrupados = OperacionesProducto.AgruparPorCategoria(productos);

        Assert.Equal(2, agrupados["Periféricos"].Count);
        Assert.Single(agrupados["Pantallas"]);
    }
}
```

`Ordenes.PruebasUnitarias/Funcional/DescuentosPruebas.cs`:

```csharp
using Ordenes.Dominio.Funcional;
using Ordenes.Dominio.ObjetosDeValor;
using Xunit;

namespace Ordenes.PruebasUnitarias.Funcional;

public class DescuentosPruebas
{
    [Fact]
    public void DebeAplicarDescuentoPorcentualCorrectamente()
    {
        var dinero = Dinero.Crear(100);
        var descuento = Descuentos.PorcentajeFijo(0.10m);

        var resultado = descuento(dinero);

        Assert.Equal(90, resultado.Monto);
    }

    [Fact]
    public void DebeComponerVariosDescuentosEnOrden()
    {
        var dinero = Dinero.Crear(100);

        var compuesto = Descuentos.Componer(
            Descuentos.PorcentajeFijo(0.10m), // 100 -> 90
            Descuentos.MontoFijo(5m));         // 90 -> 85

        var resultado = compuesto(dinero);

        Assert.Equal(85, resultado.Monto);
    }

    [Fact]
    public void NoDebeDejarMontoNegativoConDescuentoFijo()
    {
        var dinero = Dinero.Crear(3);
        var descuento = Descuentos.MontoFijo(10m);

        var resultado = descuento(dinero);

        Assert.Equal(0, resultado.Monto);
    }
}
```

## Checklist para integrar `Categoria` de verdad al proyecto (opcional, si quieres llevarlo a producción)

Si decides que `Categoria` sea un campo real y no solo para esta práctica:

1. Agregar `Categoria` a `CrearProductoRequest` y `ProductoResponse`
2. Actualizar `ProductoConfiguracion.cs` con `builder.Property(p => p.Categoria).IsRequired().HasMaxLength(100)`
3. Actualizar `CrearProducto` caso de uso para pasar la categoría
4. Actualizar el formulario Angular (`productos-formulario`) con un campo de categoría (podrías usar `MatSelect` con categorías predefinidas)
5. Crear migración: `Add-Migration AgregarCategoriaProducto`

## Preguntas de validación del Día 4 (para verificar que quedó claro)

- **¿Qué hace que una función sea pura?** → `CalcularTotal`, `FiltrarDisponibles` y las funciones de `Descuentos` no modifican nada externo, no dependen de variables globales, y siempre devuelven el mismo resultado dado el mismo input.
- **¿Cuándo usarías `record` en C#?** → Ya lo haces en `Dinero`, `CantidadProducto`, `OrdenId` — cuando el objeto representa un valor (no una identidad) y quieres igualdad estructural e inmutabilidad por defecto.
- **¿Qué ventaja tiene LINQ frente a ciclos imperativos?** → `Where`, `GroupBy`, `Aggregate` expresan **qué** quieres (el resultado), no **cómo** iterar paso a paso — son más declarativos, más cortos, y menos propensos a errores de estado mutable.
- **¿Cuándo una excepción no debería usarse para controlar flujo de negocio?** → Ya lo resolviste con el Result pattern: en vez de lanzar excepciones para "descuento inválido", una función pura como `MontoFijo` simplemente devuelve `0` como piso, sin lanzar nada.

¿Quieres que integremos `Categoria` de verdad al proyecto (migración incluida), o seguimos con el Día 11 (FluentValidation, CORS, health checks)?