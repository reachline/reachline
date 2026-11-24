// The options of a Select: a .svelte file's own types aren't visible to the linter.
export interface SelectOption {
  value: string;
  /** Shown instead of the value. */
  label?: string;
  /** A kind of thing, whose icon goes beside it. */
  kind?: string;
  /** An id, in the code font. */
  mono?: boolean;
}
export interface SelectGroup {
  /** Named groups get a heading, with the icon of their kind if they have one. */
  name?: string;
  kind?: string;
  options: SelectOption[];
}
