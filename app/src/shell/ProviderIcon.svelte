<script lang="ts">
  // The sign-in provider's icon (AUTH_OIDC_ICON), beside its name: decorative,
  // and left out if it doesn't load, rather than drawn broken.
  let { src }: { src: string | null | undefined } = $props();
  let failed = $state(false);
</script>

{#if src && !failed}
  <img class="provider-icon" {src} alt="" referrerpolicy="no-referrer" onerror={() => (failed = true)} />
{/if}

<style>
  .provider-icon {
    flex: none;
    width: 1.25em;
    height: 1.25em;
    object-fit: contain;
  }
</style>
