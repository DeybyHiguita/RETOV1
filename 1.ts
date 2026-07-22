import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { catchError, throwError } from 'rxjs';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const snackBar = inject(MatSnackBar);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      const mensaje = obtenerMensajeError(error);

      snackBar.open(mensaje, 'Cerrar', {
        duration: 5000,
        panelClass: ['snackbar-error']
      });

      return throwError(() => error);
    })
  );
};

function obtenerMensajeError(error: HttpErrorResponse): string {
  // Error de red (backend caído, sin conexión)
  if (error.status === 0) {
    return 'No se pudo conectar con el servidor. Verifica tu conexión.';
  }

  // Tu API devuelve ProblemDetails (RFC 7807) desde ManejarResultado
  const problemDetails = error.error;

  if (problemDetails?.detail) {
    return problemDetails.detail;
  }

  if (problemDetails?.title) {
    return problemDetails.title;
  }

  // Fallback según código HTTP
  switch (error.status) {
    case 400:
      return 'La solicitud contiene datos inválidos.';
    case 401:
      return 'No estás autenticado. Inicia sesión nuevamente.';
    case 403:
      return 'No tienes permisos para realizar esta acción.';
    case 404:
      return 'El recurso solicitado no existe.';
    case 409:
      return 'Conflicto con el estado actual de los datos.';
    case 500:
      return 'Ocurrió un error interno en el servidor.';
    default:
      return 'Ocurrió un error inesperado.';
  }
}

import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { routes } from './app.routes';
import { errorInterceptor } from './core/interceptors/error.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideHttpClient(withInterceptors([errorInterceptor])),
    provideAnimations()
  ]
};

.snackbar-error {
  background-color: #d32f2f !important;
  color: white !important;

  .mat-mdc-snack-bar-label {
    color: white !important;
  }
}

enviar(): void {
  if (this.formulario.invalid) {
    this.formulario.markAllAsTouched();
    return;
  }

  this.cargando = true;

  this.ordenesService.crear(this.formulario.value as any).subscribe({
    next: (respuesta) => {
      this.ordenCreada = respuesta;
      this.cargando = false;
      this.formulario.reset();
      this.snackBar.open('Orden creada exitosamente', 'Cerrar', { duration: 3000 });
    },
    error: () => {
      // El interceptor ya mostró la notificación de error.
      // Aquí solo necesitas detener el estado de "cargando".
      this.cargando = false;
    }
  });
}