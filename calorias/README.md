# Mis calorías

Contador diario de calorías con una tabla de alimentos habituales en Argentina.
App independiente de `fieldlog` (la app de la raíz del repo): no comparte código ni deploy.

## Uso

```bash
cd calorias
npm start          # http://localhost:3100  (PORT para cambiar el puerto)
```

No tiene dependencias (Node >= 18). Los datos se guardan en `calorias/data/datos.json`
(`DATA_DIR` para cambiar la carpeta).

## Qué hace

- Límite diario configurable y contador acumulado del día (anillo de progreso).
- Carga de comidas buscando en la tabla (porciones o gramos) o a mano con las kcal del envase.
- Aviso **antes de guardar** si la comida te haría pasar el límite, con opciones más livianas.
- Si te pasás: ranking de qué comidas pesaron más, reemplazos posibles y combinaciones
  de cambios que te devuelven al límite.
- Historial de los últimos 7 días.
- Foto opcional por comida (se guarda una miniatura).

## Límites conocidos

- **La foto no calcula calorías.** Queda como registro visual. Reconocer la comida
  requiere un modelo de IA con visión (servicio pago con API key); quedó fuera de esta versión.
- **Los valores calóricos son aproximados** (ver `public/alimentos.js`): promedios típicos,
  no mediciones. Para productos envasados usá el rótulo.
- **Un solo usuario, sin login.** Quien acceda a la URL puede ver y modificar los datos:
  no la publiques en internet sin ponerle autenticación delante.
- La cámara del celular y la instalación como PWA requieren HTTPS (o `localhost`).
