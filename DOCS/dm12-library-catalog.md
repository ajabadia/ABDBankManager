# Catálogo de librerías DeepMind 12

El corpus de investigación recibido está temporalmente en `DOCS/LIBRERÍAS-dm12-borrar/`.

## Inventario inicial

- 189 archivos `.syx` detectados.
- Categorías: fábrica, gratuitos, comunidad, usuarios, comerciales, Filipe Lopes y desconocidos.
- También hay 15 archivos `.mid` dentro de un paquete comercial.
- Los archivos comerciales y comunitarios no deben redistribuirse automáticamente.

## Política de fixtures

### Fixtures incluidos

Todos los derechos de redistribución confirmados por el propietario del proyecto. Estructura definitiva:

```
fixtures/sysex/behringer-deepmind12/
├── factory/          Bancos de fábrica v1.0 y v1.1.2
├── community/        Parches gratuitos (Alba Ecstasy)
├── user/             Parches de usuarios various
├── commercial/       Parches comerciales (derechos adquiridos)
├── unknown/          Bancos de origen desconocido
└── README.md         Documentación completa
```

### Criterios de selección

1. Cobertura de firmware: v1.0 y v1.1.2 de fábrica.
2. Cobertura de categorías: fábrica, comunidad, usuario, comercial, desconocido.
3. Parches individuales para testing de parsing puntual.
4. Bancos completos de 128 patches para testing de importación masiva.
5. Documentación de procedencia y licencia por archivo.

### Metadatos por fixture

Cada fixture registrado en `README.md` incluye:

- nombre y categoría;
- SHA-256;
- número de mensajes SysEx;
- longitudes observadas;
- bancos/programas detectados;
- protocolo/firmware;
- estado de licencia;
- resultado del parser.

## Resultado del catálogo

El catálogo reproducible (`npm run catalog:dm12`) detectó 260 archivos `.syx`. Los bancos de fábrica v1.0 y los bancos de usuarios/desconocidos muestran mensajes de 291 bytes con cabecera `F0 00 20 32 20 <device> 02 <protocol> <bank> <program>`, payload empaquetado de 278 bytes y 242 bytes decodificados.

El contrato canónico del DeepMind se ha alineado con esta estructura y conserva banco/programa. Se han incluido 14 fixtures representativos en la estructura definitiva con tests automatizados.

## Fixtures incluidos (14 archivos)

| Categoría | Archivos | Patches |
|---|---|---|
| Factory v1.0 | Bank A–D | 512 |
| Factory v1.1.2 | Bank A, H | 256 |
| Community | AE Angelia, AE CinemaDrone | 2 |
| User | 80s, GROKa | 256 |
| Commercial | 5P Media, Ambient Mind Vol 1 | 256 |
| Unknown | Warmup, 80s | 129 |

## Próximo paso

Validar el flujo completo contra un DeepMind 12D físico (fetch/send).
