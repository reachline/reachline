# Auth

Users sign in with a username and password, with an OpenID Connect provider (single sign-on), or either. `AUTH_METHODS` chooses: `password` (the default), `oidc`, or `password,oidc`.

At someone's first sign-in with the provider, ReachLine links them to the account with the same username as theirs at the provider (its `preferred_username`), if that account isn't linked yet. Otherwise it makes a new account, with a username from the provider's. Either way, later sign-ins find the account by the provider's identity (issuer and subject), never by email or name. Anyone can link or unlink the provider, or add or remove a password, on their account page, as long as one way in remains.

Linking by username trusts the provider's usernames: whoever is `alice` there gets `alice`'s account here. If people can choose their own username at the provider, set `AUTH_OIDC_LINK_USERNAME=0`, and link accounts from their account pages instead.

ReachLine doesn't check groups. Who may sign in is the provider's decision, so limit the application to the right people there. With registration on, anyone the provider lets through gets an account.

## Single sign-on

Register ReachLine with your provider as a client with the redirect URI `<PUBLIC_URL>/api/auth/oidc/callback`, then give ReachLine the provider's details in `.env`. ReachLine's server has to be able to reach the issuer's address.

To use only the provider, set `AUTH_METHODS=oidc`. Accounts whose username matches the provider's link at their next sign-in; anyone else should link theirs first, since an account with only a password can no longer sign in.

### Example: Authentik

1. In Authentik, create an application with an OAuth2/OpenID provider. Make it a confidential client, with the redirect URI `https://reachline.example.com/api/auth/oidc/callback`, and choose a signing key.
2. To sign people out of ReachLine when their Authentik session ends, set the provider's logout URI to `https://reachline.example.com/api/auth/oidc/logout`, with the back-channel method (Authentik 2025.8 or newer). Authentik's server has to be able to reach that address.
3. Bind the users or groups who may use ReachLine to the application.
4. Give ReachLine the provider's details in `.env`, then run `docker compose up -d`:

   ```sh
   AUTH_METHODS=password,oidc
   AUTH_OIDC_ISSUER=https://auth.example.com/application/o/reachline/   # the provider's issuer, trailing slash and all
   AUTH_OIDC_CLIENT_ID=...
   AUTH_OIDC_CLIENT_SECRET=...
   AUTH_OIDC_LABEL=Authentik   # the provider's name: the button says Sign in with Authentik
   AUTH_OIDC_ICON=https://auth.example.com/static/dist/assets/icons/icon.png   # optional, beside the name
   ```
