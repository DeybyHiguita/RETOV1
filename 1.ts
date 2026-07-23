Perfecto, vamos a integrar `Categoria` como campo real y completo en todo el flujo: dominio (ya lo hicimos), DTOs, EF Core, caso de uso, controlador, y Angular.

## 1. DTOs — agregar Categoria

`DTOs/Producto/CrearProductoRequest.cs`:

```csharp
namespace Ordenes.Aplicacion.DTOs;

public record CrearProductoRequest(string Nombre, decimal Precio, int StockInicial, string Categoria);
```

`DTOs/Producto/ProductoResponse.cs`:

```csharp
namespace Ordenes.Aplicacion.DTOs;

public record ProductoResponse(Guid Id, string Nombre, decimal Precio, int Stock, string Categoria);
```

`DTOs/Producto/ActualizarProductoRequest.cs` (si ya lo tienes del módulo de edición):

```csharp
namespace Ordenes.Aplicacion.DTOs;

public record ActualizarProductoRequest(string Nombre, decimal Precio, int Stock, string Categoria);
```

## 2. Configuración EF Core

`Persistencia/Configuraciones/ProductoConfiguracion.cs`:

```csharp
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Ordenes.Dominio.Entidades;

namespace Ordenes.Infraestructura.Persistencia.Configuraciones;

public class ProductoConfiguracion : IEntityTypeConfiguration<Producto>
{
    public void Configure(EntityTypeBuilder<Producto> builder)
    {
        builder.ToTable("Productos");

        builder.HasKey(producto => producto.Id);

        builder.Property(producto => producto.Id)
            .ValueGeneratedNever();

        builder.Property(producto => producto.Nombre)
            .IsRequired()
            .HasMaxLength(200);

        builder.Property(producto => producto.Stock)
            .IsRequired();

        builder.Property(producto => producto.Categoria)
            .IsRequired()
            .HasMaxLength(100);

        builder.HasIndex(producto => producto.Categoria); // útil para filtrar/agrupar por categoría en consultas

        builder.OwnsOne(producto => producto.Precio, precio =>
        {
            precio.Property(p => p.Monto)
                .HasColumnName("Precio")
                .HasColumnType("decimal(18,2)")
                .IsRequired();
        });
    }
}
```

## 3. Caso de uso CrearProducto

`CasosDeUso/CrearProducto.cs`:

```csharp
using Ordenes.Aplicacion.DTOs;
using Ordenes.Aplicacion.Interfaces;
using Ordenes.Aplicacion.Resultados;
using Ordenes.Dominio.Entidades;
using Ordenes.Dominio.Excepciones;

namespace Ordenes.Aplicacion.CasosDeUso;

public class CrearProducto
{
    private readonly IRepositorioProductos _repositorioProductos;

    public CrearProducto(IRepositorioProductos repositorioProductos)
    {
        _repositorioProductos = repositorioProductos;
    }

    public async Task<Resultado<ProductoResponse>> EjecutarAsync(
        CrearProductoRequest request,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var producto = Producto.Crear(request.Nombre, request.Precio, request.StockInicial, request.Categoria);

            await _repositorioProductos.GuardarAsync(producto, cancellationToken);

            return Resultado.Exito(MapearAResponse(producto));
        }
        catch (ExcepcionDominio ex)
        {
            return Resultado.Fallo<ProductoResponse>(Error.Validacion(ex.Message));
        }
    }

    private static ProductoResponse MapearAResponse(Producto producto) =>
        new(producto.Id, producto.Nombre, producto.Precio.Monto, producto.Stock, producto.Categoria);
}
```

Nota: si ya tenías un `ProductoMapeador` centralizado (como hicimos con `OrdenMapeador`), es mejor moverlo ahí. Te lo dejo abajo como mejora.

## 4. Crear el mapeador centralizado de Producto (si no lo tienes ya)

`Mapeadores/ProductoMapeador.cs`:

```csharp
using Ordenes.Aplicacion.DTOs;
using Ordenes.Dominio.Entidades;

namespace Ordenes.Aplicacion.Mapeadores;

public static class ProductoMapeador
{
    public static ProductoResponse AResponse(Producto producto) =>
        new(producto.Id, producto.Nombre, producto.Precio.Monto, producto.Stock, producto.Categoria);
}
```

Y así, todos tus casos de uso de Producto (`CrearProducto`, `ConsultarProductos`, `ConsultarProductoPorId`, `ActualizarProducto`) usan `ProductoMapeador.AResponse(producto)` en vez de repetir el mapeo. Actualízalos:

```csharp
// En cada caso de uso, reemplaza el mapeo manual por:
using Ordenes.Aplicacion.Mapeadores;
// ...
return Resultado.Exito(ProductoMapeador.AResponse(producto));
```

## 5. Actualizar ActualizarProducto (dominio + caso de uso)

Ya que `ActualizarDatos` en el dominio solo tocaba nombre/precio, agrégale categoría:

`Producto.cs`:

```csharp
public void ActualizarDatos(string nombre, decimal precio, string categoria)
{
    if (string.IsNullOrWhiteSpace(nombre))
    {
        throw new ExcepcionDominio("El nombre del producto es obligatorio.");
    }

    if (string.IsNullOrWhiteSpace(categoria))
    {
        throw new ExcepcionDominio("La categoría del producto es obligatoria.");
    }

    Nombre = nombre.Trim();
    Precio = Dinero.Crear(precio);
    Categoria = categoria.Trim();
}
```

`CasosDeUso/ActualizarProducto.cs`:

```csharp
public async Task<Resultado<ProductoResponse>> EjecutarAsync(
    Guid id,
    ActualizarProductoRequest request,
    CancellationToken cancellationToken = default)
{
    var producto = await _repositorioProductos.ObtenerPorIdAsync(id, cancellationToken);

    if (producto is null)
    {
        return Resultado.Fallo<ProductoResponse>(
            Error.NoEncontrado($"No se encontró el producto con id {id}."));
    }

    try
    {
        producto.ActualizarDatos(request.Nombre, request.Precio, request.Categoria);
        producto.ActualizarStock(request.Stock);

        await _repositorioProductos.ActualizarAsync(producto, cancellationToken);

        return Resultado.Exito(ProductoMapeador.AResponse(producto));
    }
    catch (ExcepcionDominio ex)
    {
        return Resultado.Fallo<ProductoResponse>(Error.Validacion(ex.Message));
    }
}
```

## 6. Crear la migración

En la Consola del Administrador de Paquetes:

```
Add-Migration AgregarCategoriaProducto -Project Ordenes.Infraestructura -StartupProject Ordenes.Api
Update-Database -Project Ordenes.Infraestructura -StartupProject Ordenes.Api
```

**Importante:** si ya tienes productos guardados en tu base de datos de pruebas, esta migración va a fallar porque `Categoria` es `IsRequired()` sin valor por defecto para las filas existentes. Dos opciones:

**Opción A (recomendada para desarrollo):** borra la base de datos y vuelve a crearla desde cero:
```
Drop-Database -Project Ordenes.Infraestructura -StartupProject Ordenes.Api
Update-Database -Project Ordenes.Infraestructura -StartupProject Ordenes.Api
```

**Opción B:** si quieres conservar los datos, edita la migración generada para darle un valor por defecto temporal:
```csharp
migrationBuilder.AddColumn<string>(
    name: "Categoria",
    table: "Productos",
    type: "nvarchar(100)",
    maxLength: 100,
    nullable: false,
    defaultValue: "Sin categoría"); // <-- agrega esto
```

## 7. Angular — modelo actualizado

`producto.model.ts`:

```typescript
export interface CrearProductoRequest {
  nombre: string;
  precio: number;
  stockInicial: number;
  categoria: string;
}

export interface ActualizarProductoRequest {
  nombre: string;
  precio: number;
  stock: number;
  categoria: string;
}

export interface ProductoResponse {
  id: string;
  nombre: string;
  precio: number;
  stock: number;
  categoria: string;
}
```

## 8. Angular — categorías predefinidas (constante reutilizable)

`core/models/categorias-producto.ts`:

```typescript
export const CATEGORIAS_PRODUCTO: string[] = [
  'Periféricos',
  'Pantallas',
  'Componentes',
  'Audio',
  'Redes',
  'Almacenamiento',
  'Otros'
];
```

## 9. Actualizar el formulario Angular con MatSelect

`productos-formulario.component.ts`:

```typescript
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ProductosService } from '../../../core/services/productos.service';
import { NotificacionService } from '../../../core/services/notificacion.service';
import { CATEGORIAS_PRODUCTO } from '../../../core/models/categorias-producto';

import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';

@Component({
  selector: 'app-productos-formulario',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatCardModule
  ],
  templateUrl: './productos-formulario.component.html',
  styleUrl: './productos-formulario.component.scss'
})
export class ProductosFormularioComponent implements OnInit {
  modoEdicion = false;
  productoId: string | null = null;
  categorias = CATEGORIAS_PRODUCTO;

  formulario = this.fb.group({
    nombre: ['', Validators.required],
    precio: [0, [Validators.required, Validators.min(0.01)]],
    stock: [0, [Validators.required, Validators.min(0)]],
    categoria: ['', Validators.required]
  });

  constructor(
    private fb: FormBuilder,
    private productosService: ProductosService,
    private notificacionService: NotificacionService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.productoId = this.route.snapshot.paramMap.get('id');
    this.modoEdicion = !!this.productoId;

    if (this.modoEdicion && this.productoId) {
      this.cargarProducto(this.productoId);
    }
  }

  private cargarProducto(id: string): void {
    this.productosService.obtenerPorId(id).subscribe({
      next: (producto) => {
        this.formulario.patchValue({
          nombre: producto.nombre,
          precio: producto.precio,
          stock: producto.stock,
          categoria: producto.categoria
        });
      },
      error: () => {
        this.notificacionService.mostrarError('No se pudo cargar el producto.');
        this.router.navigate(['/productos/lista']);
      }
    });
  }

  enviar(): void {
    if (this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      return;
    }

    if (this.modoEdicion && this.productoId) {
      this.actualizar(this.productoId);
    } else {
      this.crear();
    }
  }

  private crear(): void {
    const valores = this.formulario.value;

    this.productosService.crear({
      nombre: valores.nombre!,
      precio: valores.precio!,
      stockInicial: valores.stock!,
      categoria: valores.categoria!
    }).subscribe({
      next: () => {
        this.notificacionService.mostrarExito('Producto creado exitosamente');
        this.router.navigate(['/productos/lista']);
      },
      error: () => {}
    });
  }

  private actualizar(id: string): void {
    const valores = this.formulario.value;

    this.productosService.actualizar(id, {
      nombre: valores.nombre!,
      precio: valores.precio!,
      stock: valores.stock!,
      categoria: valores.categoria!
    }).subscribe({
      next: () => {
        this.notificacionService.mostrarExito('Producto actualizado exitosamente');
        this.router.navigate(['/productos/lista']);
      },
      error: () => {}
    });
  }
}
```

## 10. HTML del formulario con MatSelect

`productos-formulario.component.html`:

```html
<mat-card>
  <mat-card-header>
    <mat-card-title>{{ modoEdicion ? 'Editar Producto' : 'Crear Producto' }}</mat-card-title>
  </mat-card-header>

  <mat-card-content>
    <form [formGroup]="formulario" (ngSubmit)="enviar()">
      <mat-form-field appearance="outline" style="width: 100%">
        <mat-label>Nombre</mat-label>
        <input matInput formControlName="nombre" />
      </mat-form-field>

      <mat-form-field appearance="outline" style="width: 100%">
        <mat-label>Categoría</mat-label>
        <mat-select formControlName="categoria">
          <mat-option *ngFor="let categoria of categorias" [value]="categoria">
            {{ categoria }}
          </mat-option>
        </mat-select>
      </mat-form-field>

      <mat-form-field appearance="outline" style="width: 100%">
        <mat-label>Precio</mat-label>
        <input matInput type="number" formControlName="precio" />
      </mat-form-field>

      <mat-form-field appearance="outline" style="width: 100%">
        <mat-label>{{ modoEdicion ? 'Stock' : 'Stock inicial' }}</mat-label>
        <input matInput type="number" formControlName="stock" />
      </mat-form-field>

      <button mat-raised-button color="primary" type="submit">
        {{ modoEdicion ? 'Guardar cambios' : 'Crear Producto' }}
      </button>
    </form>
  </mat-card-content>
</mat-card>
```

## 11. Actualizar la tabla de listado para mostrar Categoría

`productos-lista.component.ts`:

```typescript
columnas: string[] = ['nombre', 'categoria', 'precio', 'stock', 'acciones'];
```

`productos-lista.component.html`:

```html
<ng-container matColumnDef="categoria">
  <th mat-header-cell *matHeaderCellDef>Categoría</th>
  <td mat-cell *matCellDef="let producto">{{ producto.categoria }}</td>
</ng-container>
```

(Agrégalo entre la columna `nombre` y `precio` en el HTML.)

## 12. Actualizar tus pruebas unitarias existentes de Producto

En `CrearProductoPruebas.cs`, ajusta las llamadas para incluir categoría:

```csharp
[Fact]
public async Task DebeCrearProductoCorrectamente()
{
    var request = new CrearProductoRequest("Teclado mecánico", 89.90m, 50, "Periféricos");

    var resultado = await _crearProducto.EjecutarAsync(request);

    Assert.True(resultado.EsExitoso);
    Assert.Equal("Periféricos", resultado.Valor!.Categoria);
}

[Fact]
public async Task DebeFallarSiCategoriaEsVacia()
{
    var request = new CrearProductoRequest("Teclado", 89.90m, 50, "");

    var resultado = await _crearProducto.EjecutarAsync(request);

    Assert.False(resultado.EsExitoso);
}
```

## 13. Compilar y probar todo

1. `Ctrl+Shift+B` en Visual Studio
2. `Add-Migration` + `Update-Database` (o `Drop-Database` si prefieres empezar limpio)
3. `F5` para correr la API
4. `ng serve` para Angular
5. Ve a `/productos/crear`, ahora debería aparecer el selector de categoría
6. Crea un producto, verifica que aparece en el listado con su categoría
7. Edítalo y confirma que la categoría se precarga y se puede cambiar

---

¿Compiló todo bien y la migración se aplicó sin problema, o te encontraste algún error en el camino?