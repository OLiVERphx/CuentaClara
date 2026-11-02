export function descargarArchivo(contenido: Blob | string, nombre: string, tipo = 'text/plain;charset=utf-8'): void {
  const blob = typeof contenido === 'string' ? new Blob([contenido], { type: tipo }) : contenido;
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  document.body.append(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
