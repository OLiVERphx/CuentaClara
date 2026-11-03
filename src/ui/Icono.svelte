<script lang="ts" module>
  const TRAZOS = {
    buscar: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    caja: '<path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z"/><path d="M3 7.5 12 12l9-4.5M12 12v9"/>',
    inventario: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 3h6v3H9zM9 11h6M9 15h4"/>',
    config: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
    candado: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    mas: '<path d="M12 5v14M5 12h14"/>',
    subir: '<path d="M12 16V4M7 9l5-5 5 5M5 20h14"/>',
    bajar: '<path d="M12 4v12M7 11l5 5 5-5M5 20h14"/>',
    alerta: '<path d="M12 3 2 20.5h20z"/><path d="M12 10v4.5M12 17.5v.01"/>',
    refrescar: '<path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5"/>',
    cerrar: '<path d="M6 6l12 12M18 6 6 18"/>',
    basura: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    atras: '<path d="m15 5-7 7 7 7"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
    dolar: '<path d="M12 3v18M16.5 7.5c-.8-1.3-2.5-2-4.5-2-2.5 0-4.5 1.3-4.5 3.2 0 1.9 2 2.8 4.5 3.3s4.5 1.4 4.5 3.3c0 1.9-2 3.2-4.5 3.2-2 0-3.7-.7-4.5-2"/>',
    escudo: '<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6z"/>',
    tienda: '<path d="M4 9.5V20h16V9.5M3 4h18l-1 5.5H4zM9.5 20v-6h5v6"/>',
    nube: '<path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 9.5a4 4 0 0 1-1 8.5z"/>',
    carrito: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.6 12.4a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 2-1.5L22 8H6.2"/>',
    recibo: '<path d="M6 2h12v20l-3-2-3 2-3-2-3 2z"/><path d="M9 7h6M9 11h6M9 15h4"/>',
    billete: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 9.5v5M18 9.5v5"/>',
    imprimir: '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/>',
    deshacer: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  } as const;

  export type NombreIcono = keyof typeof TRAZOS;
</script>

<script lang="ts">
  let { nombre, tamano = 20 }: { nombre: NombreIcono; tamano?: number } = $props();
</script>

<svg
  width={tamano}
  height={tamano}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  {@html TRAZOS[nombre]}
</svg>

<style>
  svg {
    flex-shrink: 0;
  }
</style>
