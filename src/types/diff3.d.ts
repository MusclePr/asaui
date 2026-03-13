declare module "diff3" {
  export type Diff3Chunk =
    | { ok: string[] }
    | {
        conflict: {
          a: string[];
          aIndex: number;
          o: string[];
          oIndex: number;
          b: string[];
          bIndex: number;
        };
      };

  export default function diff3Merge(
    a: string[],
    o: string[],
    b: string[]
  ): Diff3Chunk[];
}
