import { parse, stringify, v7 } from 'uuid';

export const newId = (): string => v7();
export const parseId = (value: string): Buffer => Buffer.from(parse(value));
export const stringifyId = (value: Buffer): string => stringify(new Uint8Array(value));
