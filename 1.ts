Es un problema común con `MatSnackBar` — el botón de acción por defecto **no cierra automáticamente** la notificación, solo dispara un evento. Tienes que suscribirte a ese evento y cerrar manualmente.

## El problema en tu código actual

```typescript
snackBar.open(mensaje, 'Cerrar', {
  duration: 5000,
  panelClass: ['snackbar-error']
});
```

`snackBar.open()` devuelve una referencia (`MatSnackBarRef`) que tiene un observable `onAction()` — si no te suscribes a él y llamas `.dismiss()`, el botón "Cerrar" solo se ve, pero no hace nada.

## Solución

## 1. Corregir el interceptor de errores

```typescript
import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { catchError, throwError } from 'rxjs';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const snackBar = inject(MatSnackBar);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      const mensaje = obtenerMensajeError(error);

      const snackBarRef = snackBar.open(mensaje, 'Cerrar', {
        duration: 5000,
        panelClass: ['snackbar-error']
      });

      // Cierra la notificación cuando se hace clic en "Cerrar"
      snackBarRef.onAction().subscribe(() => {
        snackBarRef.dismiss();
      });

      return throwError(() => error);
    })
  );
};

function obtenerMensajeError(error: HttpErrorResponse): string {
  // ... (mismo contenido que ya tenías)
}
```

## 2. Aplica lo mismo donde uses snackBar con botón de acción

En tus componentes (`ordenes-crear.component.ts`, `productos-crear.component.ts`), si el snackbar de éxito también tiene botón "Cerrar":

```typescript
const snackBarRef = this.snackBar.open('Orden creada exitosamente', 'Cerrar', { duration: 3000 });
snackBarRef.onAction().subscribe(() => snackBarRef.dismiss());
```

## Alternativa más limpia: crear un servicio de notificaciones centralizado

En vez de repetir el `.onAction().subscribe(...)` en cada lugar, mejor centralízalo. Esto también resuelve el problema de que tienes lógica de snackbar duplicada entre el interceptor y los componentes.

```
ng generate service core/services/notificacion
```

Edita `notificacion.service.ts`:

```typescript
import { Injectable } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

@Injectable({ providedIn: 'root' })
export class NotificacionService {
  constructor(private snackBar: MatSnackBar) {}

  mostrarExito(mensaje: string): void {
    this.mostrar(mensaje, ['snackbar-exito']);
  }

  mostrarError(mensaje: string): void {
    this.mostrar(mensaje, ['snackbar-error']);
  }

  private mostrar(mensaje: string, clases: string[]): void {
    const snackBarRef = this.snackBar.open(mensaje, 'Cerrar', {
      duration: 5000,
      panelClass: clases
    });

    snackBarRef.onAction().subscribe(() => snackBarRef.dismiss());
  }
}
```

Ahora tu interceptor queda más simple:

```typescript
import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { NotificacionService } from '../services/notificacion.service';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const notificacionService = inject(NotificacionService);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      const mensaje = obtenerMensajeError(error);
      notificacionService.mostrarError(mensaje);
      return throwError(() => error);
    })
  );
};

function obtenerMensajeError(error: HttpErrorResponse): string {
  // ... (mismo contenido)
}
```

Y en tus componentes:

```typescript
this.ordenesService.crear(this.formulario.value as any).subscribe({
  next: (respuesta) => {
    this.ordenCreada = respuesta;
    this.formulario.reset();
    this.notificacionService.mostrarExito('Orden creada exitosamente');
  },
  error: () => {
    // El interceptor ya notificó el error
  }
});
```

No olvides inyectar el nuevo servicio en el constructor en vez de `MatSnackBar` directamente:

```typescript
constructor(
  private fb: FormBuilder,
  private ordenesService: OrdenesService,
  private notificacionService: NotificacionService
) {}
```

## 3. Agregar el estilo de éxito (si no lo tienes)

En `styles.scss` global:

```scss
.snackbar-error {
  background-color: #d32f2f !important;
  color: white !important;

  .mat-mdc-snack-bar-label {
    color: white !important;
  }
}

.snackbar-exito {
  background-color: #388e3c !important;
  color: white !important;

  .mat-mdc-snack-bar-label {
    color: white !important;
  }
}
```

---

Con el servicio centralizado, el botón "Cerrar" ahora sí cierra la notificación, y de paso eliminas la duplicación de lógica de snackbar entre el interceptor y los componentes. ¿Quieres que migremos también el snackbar de `productos-crear.component.ts` a este nuevo servicio?