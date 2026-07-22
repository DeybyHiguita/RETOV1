Arquitecturó solución integral para spinner de carga automático
Arquitecturó solución integral para spinner de carga automático

Vamos a crear un interceptor de carga global que muestre un spinner automáticamente en cada petición HTTP, sin que cada componente tenga que manejar su propio estado de cargando.

Estructura
src/app/core/
├── services/
│   └── loading.service.ts
└── interceptors/
    └── loading.interceptor.ts

src/app/shared/
└── spinner-global/
    ├── spinner-global.component.ts
    ├── spinner-global.component.html
    └── spinner-global.component.scss
1. Servicio de estado de carga

Este servicio lleva la cuenta de cuántas peticiones están activas (importante, porque si tienes 3 llamadas simultáneas, no quieres que el spinner desaparezca cuando termine solo la primera).

ng generate service core/services/loading

Edita loading.service.ts:

typescript
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class LoadingService {
  private contadorPeticiones = 0;
  private readonly cargandoSubject = new BehaviorSubject<boolean>(false);

  cargando$ = this.cargandoSubject.asObservable();

  mostrar(): void {
    this.contadorPeticiones++;
    this.cargandoSubject.next(true);
  }

  ocultar(): void {
    this.contadorPeticiones = Math.max(0, this.contadorPeticiones - 1);

    if (this.contadorPeticiones === 0) {
      this.cargandoSubject.next(false);
    }
  }
}
2. Interceptor de carga
ng generate interceptor core/interceptors/loading --functional

Edita loading.interceptor.ts:

typescript
import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { finalize } from 'rxjs';
import { LoadingService } from '../services/loading.service';

export const loadingInterceptor: HttpInterceptorFn = (req, next) => {
  const loadingService = inject(LoadingService);

  loadingService.mostrar();

  return next(req).pipe(
    finalize(() => loadingService.ocultar())
  );
};

finalize() es clave aquí: se ejecuta tanto si la petición tiene éxito como si falla, así el spinner siempre se oculta correctamente (a diferencia de poner la lógica dentro de next o catchError, donde podrías olvidar un caso).

3. Componente del spinner global
ng generate component shared/spinner-global --standalone

Edita spinner-global.component.ts:

typescript
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AsyncPipe } from '@angular/common';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { LoadingService } from '../../core/services/loading.service';

@Component({
  selector: 'app-spinner-global',
  standalone: true,
  imports: [CommonModule, AsyncPipe, MatProgressBarModule],
  templateUrl: './spinner-global.component.html',
  styleUrl: './spinner-global.component.scss'
})
export class SpinnerGlobalComponent {
  constructor(public loadingService: LoadingService) {}
}

Edita spinner-global.component.html:

html
<mat-progress-bar
  *ngIf="loadingService.cargando$ | async"
  mode="indeterminate"
  class="barra-carga-global"
></mat-progress-bar>

Usé mat-progress-bar (una barra delgada arriba, estilo YouTube/Gmail) en vez de un mat-spinner circular, porque es menos intrusiva para un spinner "global" que aparece en cada llamada. Si prefieres el spinner circular centrado en pantalla, te muestro esa alternativa más abajo.

Edita spinner-global.component.scss:

scss
.barra-carga-global {
  position: fixed;
  top: 64px; // justo debajo de tu toolbar
  left: 0;
  right: 0;
  z-index: 1000;
  height: 3px;
}
4. Registrar el interceptor en app.config.ts
typescript
import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { routes } from './app.routes';
import { errorInterceptor } from './core/interceptors/error.interceptor';
import { loadingInterceptor } from './core/interceptors/loading.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideHttpClient(withInterceptors([loadingInterceptor, errorInterceptor])),
    provideAnimations()
  ]
};

Orden importante: puse loadingInterceptor primero para que se active apenas sale la petición, y errorInterceptor después para que capture errores en el camino de vuelta. El orden de la lista define el orden de ejecución.

5. Agregar el spinner al layout principal

Edita layout-principal.component.ts para importar el spinner:

typescript
import { SpinnerGlobalComponent } from '../../spinner-global/spinner-global.component';

@Component({
  selector: 'app-layout-principal',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatToolbarModule,
    MatSidenavModule,
    MatListModule,
    MatIconModule,
    MatButtonModule,
    SpinnerGlobalComponent // <-- agregar
  ],
  templateUrl: './layout-principal.component.html',
  styleUrl: './layout-principal.component.scss'
})
export class LayoutPrincipalComponent {
  // ... mismo contenido
}

Edita layout-principal.component.html para incluirlo justo después del toolbar:

html
<mat-toolbar color="primary" class="toolbar-principal">
  <button mat-icon-button (click)="alternarMenu()">
    <mat-icon>menu</mat-icon>
  </button>
  <span class="titulo-app">Plataforma de Órdenes</span>
</mat-toolbar>

<app-spinner-global></app-spinner-global>

<mat-sidenav-container class="contenedor-principal">
  <!-- resto igual -->
</mat-sidenav-container>
6. Simplificar tus componentes (ya no necesitas la variable cargando local)

Ahora que el spinner es global, puedes simplificar ordenes-crear.component.ts:

typescript
enviar(): void {
  if (this.formulario.invalid) {
    this.formulario.markAllAsTouched();
    return;
  }

  this.ordenesService.crear(this.formulario.value as any).subscribe({
    next: (respuesta) => {
      this.ordenCreada = respuesta;
      this.formulario.reset();
      this.snackBar.open('Orden creada exitosamente', 'Cerrar', { duration: 3000 });
    },
    error: () => {
      // El interceptor de error ya notificó, y el de loading ya ocultó el spinner
    }
  });
}

Puedes quitar cargando = false/true y el [disabled]="cargando" del botón si prefieres depender solo del spinner global — aunque yo mantendría el disabled del botón para evitar doble clic mientras la petición está en curso (eso sigue siendo responsabilidad del componente, no del interceptor).

Alternativa: spinner circular centrado (si prefieres esto en vez de la barra superior)

Si te gusta más un spinner circular con fondo semitransparente cubriendo la pantalla:

html
<div class="overlay-carga" *ngIf="loadingService.cargando$ | async">
  <mat-spinner diameter="50"></mat-spinner>
</div>
scss
.overlay-carga {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

(Recuerda cambiar el import de MatProgressBarModule a MatProgressSpinnerModule si usas esta versión.)

7. Probar
ng serve

Al hacer cualquier petición (crear orden, listar productos), deberías ver la barra de progreso aparecer arriba y desaparecer cuando termina.

¿Prefieres la barra delgada arriba o el spinner circular centrado? ¿O te funcionó bien la que armamos y seguimos con otra parte de la guía?