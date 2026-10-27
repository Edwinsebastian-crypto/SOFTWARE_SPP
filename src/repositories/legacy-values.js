'use strict';

/**
 * Translation between the English values used by the application and the (Spanish) values that are
 * PERSISTED in the existing databases. Keeping this in one file confines the legacy vocabulary to the
 * persistence layer: services, controllers and the frontend only ever see the English values.
 */

function createMapping(pairs) {
  const toStored = new Map(Object.entries(pairs));
  const fromStored = new Map(Object.entries(pairs).map(([english, stored]) => [stored.toLowerCase(), english]));
  return {
    /** English -> stored value. Unknown values are returned untouched. */
    toStored: (value) => (toStored.has(value) ? toStored.get(value) : value),
    /** Stored value -> English. Comparison ignores case and surrounding blanks (legacy data is messy). */
    fromStored: (value) => {
      const key = String(value ?? '').trim().toLowerCase();
      return fromStored.has(key) ? fromStored.get(key) : value;
    }
  };
}

const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s);

module.exports = {
  capitalize,
  /** Role tables / user status are stored as 'activo', 'pendiente', 'inactivo'. */
  userStatus: createMapping({ active: 'activo', pending: 'pendiente', inactive: 'inactivo' }),
  practiceStatus: createMapping({ active: 'activa', completed: 'finalizada', cancelled: 'cancelada' }),
  auditEntity: createMapping({
    practice: 'Practica', logbook: 'Bitacora', activity: 'Actividad', evidence: 'Evidencia', feedback: 'Retroalimentacion', user: 'Usuario'
  }),
  auditAction: createMapping({ insert: 'Insertar', update: 'Modificar', delete: 'Eliminar' })
};
