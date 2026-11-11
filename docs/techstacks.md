## NESTJS Auth system
- Use Passport JWT
- email signup and login (phase 1)
- use google firebase project to address verification and password resets (emails)
- use fallback to Maileroo, 2nd fallback to google smtp
- Firebase Authentication handles Google Sign-In.
- NestJS handles manual registration, login and password management.
- NestJS remains the authority for customer accounts, sessions and permissions.
- PostgreSQL stores all customer information.

## For third party dealers (for stock update and products update) – Use API key 
- use api versioning, v1/v2 and such
- Header-based: Have them send it in a header, like X-API-Key: your_key_here.
- Read-Only: Restrict third-party keys so they can only access GET /stock routes, preventing them from modifying data.
- Rate Limiting: Implement throttling (using @nestjs/throttler) so a third party cannot crash your VPS by spamming requests.

## DB
- Use postgres with typeorm

## Media Management
- use separate folder name it media folder. we will use cdn style strucure for media management. (doing it to prevent time loss and security vulnarebilty)