import { z } from "zod";

export const connectRequestSchema = z.object({ target: z.string().min(1) });
export type ConnectRequest = z.infer<typeof connectRequestSchema>;

export const switchDatabaseRequestSchema = z.object({ database: z.string().min(1) });
export type SwitchDatabaseRequest = z.infer<typeof switchDatabaseRequestSchema>;
