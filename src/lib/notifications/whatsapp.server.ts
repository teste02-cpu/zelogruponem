export type WhatsAppMessage = { to: string; body: string };

/** Provider boundary for a future, server-only WhatsApp integration. */
export interface WhatsAppAdapter {
  send(message: WhatsAppMessage): Promise<void>;
}

export type WhatsAppAdapterFactory = (env: NodeJS.ProcessEnv) => WhatsAppAdapter;

const providers = new Map<string, WhatsAppAdapterFactory>();

export function registerWhatsAppProvider(name: string, factory: WhatsAppAdapterFactory): void {
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error("Invalid WhatsApp provider name.");
  providers.set(name, factory);
}

export function createWhatsAppAdapter(
  env: NodeJS.ProcessEnv = process.env,
): WhatsAppAdapter | null {
  const provider = env["WHATSAPP_PROVIDER"];
  if (!provider) return null;
  const factory = providers.get(provider);
  if (!factory) throw new Error(`WhatsApp provider "${provider}" has no server adapter installed.`);
  return factory(env);
}
