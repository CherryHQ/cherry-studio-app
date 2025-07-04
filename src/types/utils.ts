export type ValueJSONed<T> = {
  [P in keyof T]: T[P] extends object | null | undefined
    ? T[P] extends string | number | boolean | bigint | symbol
      ? T[P]
      : string
    : T[P]
}
