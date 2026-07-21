/**
 * Substitution des placeholders `$name$`/`$value$`/`$date$` dans les topics et formats de
 * message EVOO7 (voir onglet "Paramétrage" de l'application EVOO7 elle-même).
 */

export function resolveTopic(template: string, name: string): string {
  return template.replace(/\$name\$/g, name);
}

export function resolveCommandMessage(template: string, name: string, value: string): string {
  return template.replace(/\$name\$/g, name).replace(/\$value\$/g, value);
}

/**
 * Extrait la valeur d'un message Sensor EVOO7. Les 43 formats connus utilisent tous la même clé
 * "status" pour porter $value$ — pas besoin de reverse-parser le format_message_sensor.
 */
export function extractSensorValue(payload: string): string | undefined {
  try {
    const parsed = JSON.parse(payload) as Record<string, unknown>;
    const value = parsed.status;
    return value === undefined || value === null ? undefined : String(value);
  } catch {
    return undefined;
  }
}
