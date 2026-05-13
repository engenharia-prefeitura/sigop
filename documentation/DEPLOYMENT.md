
# Deployment Instructions for Recent Changes

## Database Updates (Supabase)

To enable the new features (Users soft-delete, Login customization, Email bypass), please execute the following SQL scripts in your Supabase SQL Editor:

1.  **Users Soft Delete & Status:**
    Run the content of `supabase_v12_soft_delete_user.sql`.
    *Adds `is_active` column to `profiles`.*

2.  **Public Settings (Login Customization):**
    Run the content of `supabase_v13_public_settings.sql`.
    *Enables public read access to `app_settings` for the login screen logic.*

3.  **User Creation (Email Verification Bypass - FIXED):**
    Run the content of `supabase_v10_fix_email_confirm.sql`.
    *Updates the `create_new_user` RPC function to set email as confirmed automatically and ensure correct password hashing.*

## Feature Summary

-   **Customizable Login:** Admins can set Logo, Institution Name, and Subtitle in "Configurações".
-   **User Management:**
    -   Admins can Disable/Enable users instead of deleting them.
    -   "Users" tab is hidden for non-admins.
    -   User avatars now fallback to Initials if no image is present.
-   **Security:**
    -   Users can change their own password in "Configurações" > "Segurança".
    -   Inactive users are blocked from logging in.
-   **Documents:**
    -   "Assinar" button added to the main list (Documents tab) for quick signing.
    -   Signature button is hidden if the user has already signed.
