// ===== CONFIGURACIÓN DE LA TIENDA =====
// Este es el único archivo que necesitas editar para poner el sitio en producción.
window.SS_CONFIG = {
  // URL de la aplicación web de Google Apps Script (termina en /exec).
  // Si se deja vacío, el sitio funciona en MODO DEMO: el inventario y los pedidos solo viven en el navegador.
  API_URL: "https://script.google.com/macros/s/AKfycbyo4E2vZToqcFR-dyWV5SO5jJ2BJWu9Yz3wZBOFU-dcGLCYkZ5Ik9kxxeMjuAXJiSVa/exec",

  // Número de WhatsApp del negocio, con código de país y sin signos. Ej.: "50370001234"
  WHATSAPP_NEGOCIO: "",

  // Costos de envío
  ENVIO_SAN_SALVADOR: 2.50,
  ENVIO_OTROS: 2.90,

  // Máximo de unidades por producto en un pedido
  MAX_POR_PRODUCTO: 10,

  // Fotos: "local" usa las fotos optimizadas de la carpeta img/pines/ (P001.webp… y mini/P001.webp…).
  //        "drive" usa las fotos públicas de Google Drive por su ID (columna FotoDriveID).
  // Para un pin nuevo: guarda su foto cuadrada como img/pines/P065.webp (1200 px) y img/pines/mini/P065.webp (480 px).
  FOTOS: "local",

  // Ubicación (tomada de tu ficha de Google Maps "Shop Shonen SV")
  UBICACION: {
    DIRECCION: "Urbanización Las Margaritas 4, Polígono S, Pasaje 35, Casa 35 S, Soyapango, San Salvador",
    LAT: 13.7305825,
    LNG: -89.1433254,
    PLACE_ID: "ChIJQ3iix_w5Y48RBV732_pY75A",
    MAPA_INTERACTIVO: true,   // muestra el mapa de Google dentro de la página
    HORARIO: [
      ["Lunes a jueves", "8:00 a. m. – 6:00 p. m."],
      ["Viernes", "8:30 a. m. – 3:00 p. m."],
      ["Sábado y domingo", "9:00 a. m. – 5:00 p. m."]
    ]
  }
};
