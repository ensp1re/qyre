export const DATABASE_ENGINES = {
  postgres: "postgres",
  sqlite: "sqlite",
  mysql: "mysql",
  mongodb: "mongodb"
} as const;

export const REMOTE_DATABASE_ENGINES = [
  DATABASE_ENGINES.postgres,
  DATABASE_ENGINES.mysql,
  DATABASE_ENGINES.mongodb
] as const;
