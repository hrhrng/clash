declare module "prisma/config" {
  export function defineConfig<T extends object>(config: T): T
  export function env(name: string): string
}
