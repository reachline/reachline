// In a .ts file rather than Confirm.svelte, so that typed linting can see it.

/** What Confirm asks. `action` names the button that goes ahead: a danger unless `danger` is false. */
export interface Question {
  title: string;
  text: string;
  action: string;
  danger?: boolean;
}
