Buena idea — un solo componente que maneje ambos modos (crear/editar) es más mantenible que duplicar código. Pero primero hay un vacío importante: **tu API todavía no tiene el endpoint para actualizar productos** (solo tienes `Crear`, `ConsultarTodos`, `ObtenerPorId`). Vamos a completar eso primero, y luego el componente Angular.

## Parte 1: Backend — agregar la actualización de Producto

### 1. Ampliar la interfaz del repositorio (ya tiene `ActualizarAsync`, solo verifica)

Ya la definiste antes en `IRepositorioProductos`:
```csharp
Task ActualizarAsync(Producto producto, CancellationToken cancellationToken = default);
```
✅ Ya está.

### 2. Crear el DTO de entrada

`DTOs/Producto/ActualizarProductoRequest.cs`:

```csharp
namespace Ordenes.Aplicacion.DTOs;

public record ActualizarProductoRequest(string Nombre, decimal Precio, int Stock);
```

### 3. Agregar método al dominio para actualizar nombre/precio (falta esto)

Tu entidad `Producto` ya tiene `ActualizarStock`, pero no un método para cambiar nombre/precio. Agrégalo en `Producto.cs`:

```csharp
public void ActualizarDatos(string nombre, decimal precio)
{
    if (string.IsNullOrWhiteSpace(nombre))
    {
        throw new ExcepcionDominio("El nombre del producto es obligatorio.");
    }

    Nombre = nombre.Trim();
    Precio = Dinero.Crear(precio);
}
```

### 4. Crear el caso de uso ActualizarProducto

`CasosDeUso/ActualizarProducto.cs`:

```csharp
using Ordenes.Aplicacion.DTOs;
using Ordenes.Aplicacion.Interfaces;
using Ordenes.Aplicacion.Resultados;
using Ordenes.Dominio.Excepciones;

namespace Ordenes.Aplicacion.CasosDeUso;

public class ActualizarProducto
{
    private readonly IRepositorioProductos _repositorioProductos;

    public ActualizarProducto(IRepositorioProductos repositorioProductos)
    {
        _repositorioProductos = repositorioProductos;
    }

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
            producto.ActualizarDatos(request.Nombre, request.Precio);
            producto.ActualizarStock(request.Stock);

            await _repositorioProductos.ActualizarAsync(producto, cancellationToken);

            return Resultado.Exito(new ProductoResponse(
                producto.Id, producto.Nombre, producto.Precio.Monto, producto.Stock));
        }
        catch (ExcepcionDominio ex)
        {
            return Resultado.Fallo<ProductoResponse>(Error.Validacion(ex.Message));
        }
    }
}
```

### 5. Registrar en Program.cs

```csharp
builder.Services.AddScoped<ActualizarProducto>();
```

### 6. Agregar el endpoint PUT en el controlador

En `ProductosController.cs` (recuerda que ya migramos a `ControladorApiBase` con `ManejarResultado`):

```csharp
private readonly ActualizarProducto _actualizarProducto;

public ProductosController(
    CrearProducto crearProducto,
    ConsultarProductos consultarProductos,
    ConsultarProductoPorId consultarProductoPorId,
    ActualizarProducto actualizarProducto)
{
    _crearProducto = crearProducto;
    _consultarProductos = consultarProductos;
    _consultarProductoPorId = consultarProductoPorId;
    _actualizarProducto = actualizarProducto;
}

/// <summary>
/// Actualiza el nombre, precio y stock de un producto existente.
/// </summary>
[HttpPut("{id}")]
[ProducesResponseType(typeof(ProductoResponse), StatusCodes.Status200OK)]
[ProducesResponseType(StatusCodes.Status400BadRequest)]
[ProducesResponseType(StatusCodes.Status404NotFound)]
public async Task<ActionResult<ProductoResponse>> Actualizar(
    Guid id,
    [FromBody] ActualizarProductoRequest request,
    CancellationToken cancellationToken)
{
    var resultado = await _actualizarProducto.EjecutarAsync(id, request, cancellationToken);
    return ManejarResultado(resultado);
}
```

---

## Parte 2: Angular — componente único para crear y editar

## 1. Actualizar el modelo

`producto.model.ts`:

```typescript
export interface CrearProductoRequest {
  nombre: string;
  precio: number;
  stockInicial: number;
}

export interface ActualizarProductoRequest {
  nombre: string;
  precio: number;
  stock: number;
}

export interface ProductoResponse {
  id: string;
  nombre: string;
  precio: number;
  stock: number;
}
```

## 2. Actualizar el servicio

`productos.service.ts`:

```typescript
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  CrearProductoRequest,
  ActualizarProductoRequest,
  ProductoResponse
} from '../models/producto.model';

@Injectable({ providedIn: 'root' })
export class ProductosService {
  private readonly baseUrl = `${environment.apiUrl}/productos`;

  constructor(private http: HttpClient) {}

  crear(request: CrearProductoRequest): Observable<ProductoResponse> {
    return this.http.post<ProductoResponse>(this.baseUrl, request);
  }

  actualizar(id: string, request: ActualizarProductoRequest): Observable<ProductoResponse> {
    return this.http.put<ProductoResponse>(`${this.baseUrl}/${id}`, request);
  }

  obtenerTodos(): Observable<ProductoResponse[]> {
    return this.http.get<ProductoResponse[]>(this.baseUrl);
  }

  obtenerPorId(id: string): Observable<ProductoResponse> {
    return this.http.get<ProductoResponse>(`${this.baseUrl}/${id}`);
  }
}
```

## 3. Renombrar/crear el componente único

Si ya tienes `productos-crear`, lo renombramos conceptualmente a `productos-formulario` (puedes renombrar la carpeta o crear uno nuevo):

```
ng generate component features/productos/productos-formulario --standalone
```

Edita `productos-formulario.component.ts`:

```typescript
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ProductosService } from '../../../core/services/productos.service';
import { NotificacionService } from '../../../core/services/notificacion.service';

import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
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
    MatButtonModule,
    MatCardModule
  ],
  templateUrl: './productos-formulario.component.html',
  styleUrl: './productos-formulario.component.scss'
})
export class ProductosFormularioComponent implements OnInit {
  modoEdicion = false;
  productoId: string | null = null;

  formulario = this.fb.group({
    nombre: ['', Validators.required],
    precio: [0, [Validators.required, Validators.min(0.01)]],
    stock: [0, [Validators.required, Validators.min(0)]]
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
          stock: producto.stock
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
      stockInicial: valores.stock!
    }).subscribe({
      next: () => {
        this.notificacionService.mostrarExito('Producto creado exitosamente');
        this.router.navigate(['/productos/lista']);
      },
      error: () => {
        // El interceptor de error ya notificó
      }
    });
  }

  private actualizar(id: string): void {
    const valores = this.formulario.value;

    this.productosService.actualizar(id, {
      nombre: valores.nombre!,
      precio: valores.precio!,
      stock: valores.stock!
    }).subscribe({
      next: () => {
        this.notificacionService.mostrarExito('Producto actualizado exitosamente');
        this.router.navigate(['/productos/lista']);
      },
      error: () => {
        // El interceptor de error ya notificó
      }
    });
  }
}
```

## 4. HTML del formulario (título y botón dinámicos según el modo)

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

## 5. Actualizar las rutas

`app.routes.ts`:

```typescript
import { Routes } from '@angular/router';
import { OrdenesCrearComponent } from './features/ordenes/ordenes-crear/ordenes-crear.component';
import { OrdenesListaComponent } from './features/ordenes/ordenes-lista/ordenes-lista.component';
import { ProductosListaComponent } from './features/productos/productos-lista/productos-lista.component';
import { ProductosFormularioComponent } from './features/productos/productos-formulario/productos-formulario.component';

export const routes: Routes = [
  { path: '', redirectTo: 'ordenes/lista', pathMatch: 'full' },
  { path: 'ordenes/crear', component: OrdenesCrearComponent },
  { path: 'ordenes/lista', component: OrdenesListaComponent },
  { path: 'productos/lista', component: ProductosListaComponent },
  { path: 'productos/crear', component: ProductosFormularioComponent },
  { path: 'productos/editar/:id', component: ProductosFormularioComponent }
];
```

Puedes borrar el componente anterior `productos-crear` si ya no lo usas.

## 6. Agregar botón "Editar" en el listado de productos

Actualiza `productos-lista.component.html` para poder navegar a editar:

```html
<table mat-table [dataSource]="productos" *ngIf="productos.length > 0">
  <ng-container matColumnDef="nombre">
    <th mat-header-cell *matHeaderCellDef>Nombre</th>
    <td mat-cell *matCellDef="let producto">{{ producto.nombre }}</td>
  </ng-container>

  <ng-container matColumnDef="precio">
    <th mat-header-cell *matHeaderCellDef>Precio</th>
    <td mat-cell *matCellDef="let producto">{{ producto.precio | currency }}</td>
  </ng-container>

  <ng-container matColumnDef="stock">
    <th mat-header-cell *matHeaderCellDef>Stock</th>
    <td mat-cell *matCellDef="let producto">{{ producto.stock }}</td>
  </ng-container>

  <ng-container matColumnDef="acciones">
    <th mat-header-cell *matHeaderCellDef>Acciones</th>
    <td mat-cell *matCellDef="let producto">
      <button mat-icon-button [routerLink]="['/productos/editar', producto.id]">
        <mat-icon>edit</mat-icon>
      </button>
    </td>
  </ng-container>

  <tr mat-header-row *matHeaderRowDef="columnas"></tr>
  <tr mat-row *matRowDef="let row; columns: columnas;"></tr>
</table>
```

Y en `productos-lista.component.ts`, agrega `'acciones'` a las columnas e importa `RouterLink` y `MatIconModule`:

```typescript
columnas: string[] = ['nombre', 'precio', 'stock', 'acciones'];
```

```typescript
imports: [CommonModule, RouterLink, MatTableModule, MatIconModule, MatProgressSpinnerModule],
```

## 7. Migrar la base de datos (por el cambio en el dominio)

Como agregaste `ActualizarDatos` al dominio, no hay cambio de esquema (mismos campos), así que **no necesitas nueva migración** — solo el método de comportamiento cambió.

## 8. Probar

1. `F5` en Visual Studio, `ng serve` en Angular
2. Ve a `/productos/lista`, crea un producto
3. Haz clic en el ícono de editar → debería precargar los datos
4. Cambia algo y guarda → debería actualizar y notificar éxito

---

¿Te compiló bien todo (backend y frontend), o te salió algún error al probar la edición?