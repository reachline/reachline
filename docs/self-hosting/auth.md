# Auth

Users sign in with a username and password, with an OpenID Connect provider (single sign-on), or either. `AUTH_METHODS` chooses: `password` (the default), `oidc`, or `password,oidc`.

An account made at its first sign-in with the provider gets a username from the provider's, and is linked to the provider's identity (issuer and subject), never matched by email or name. Anyone can link or unlink the provider, or add or remove a password, on their account page, as long as one way in remains.

ReachLine doesn't check groups. Who may sign in is the provider's decision, so limit the application to the right people there. With registration on, anyone the provider lets through gets an account.

## Single sign-on

Register ReachLine with your provider as a client with the redirect URI `<PUBLIC_URL>/api/auth/oidc/callback`, then give ReachLine the provider's details in `.env`. ReachLine's server has to be able to reach the issuer's address.

To use only the provider, set `AUTH_METHODS=oidc`, but first have everyone link their account, since an account with only a password can no longer sign in.

### Example: Authentik

1. In Authentik, create an application with an OAuth2/OpenID provider. Make it a confidential client, with the redirect URI `https://reach.example.com/api/auth/oidc/callback`, and choose a signing key.
2. To sign people out of ReachLine when their Authentik session ends, set the provider's logout URI to `https://reach.example.com/api/auth/oidc/logout`, with the back-channel method (Authentik 2025.8 or newer). Authentik's server has to be able to reach that address.
3. Bind the users or groups who may use ReachLine to the application.
4. Give ReachLine the provider's details in `.env`, then run `docker compose up -d`:

   ```sh
   AUTH_METHODS=password,oidc
   AUTH_OIDC_ISSUER=https://auth.example.com/application/o/reachline/   # the provider's issuer, trailing slash and all
   AUTH_OIDC_CLIENT_ID=...
   AUTH_OIDC_CLIENT_SECRET=...
   AUTH_OIDC_LABEL=Sign in with Authentik
   ```
