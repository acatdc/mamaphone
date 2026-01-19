# Security Configuration Guide

## 🔐 Protecting Your Credentials

This project requires sensitive API keys and credentials. Follow these steps to set up securely.

## Setup Instructions

### 1. Firebase Configuration

Copy the example file and add your Firebase credentials:

```bash
cp public/js/firebase-config.example.js public/js/firebase-config.js
```

Edit `public/js/firebase-config.js` and replace placeholder values with your Firebase project credentials.

### 2. Metered TURN Configuration

Copy the example file and add your Metered API key:

```bash
cp public/js/metered-config.example.js public/js/metered-config.js
```

Edit `public/js/metered-config.js` and replace `YOUR_METERED_API_KEY_HERE` with your actual API key from https://www.metered.ca/

## What's Protected

The following files are listed in `.gitignore` and **should NEVER be committed**:

- `public/js/firebase-config.js` - Firebase credentials
- `public/js/metered-config.js` - Metered TURN API key

## Before Deployment

**⚠️ IMPORTANT**: Before deploying to production:

1. ✅ Verify `firebase-config.js` and `metered-config.js` are in `.gitignore`
2. ✅ Check `git status` - these files should NOT appear
3. ✅ Review your commit history - if accidentally committed, rotate keys immediately
4. ✅ Use Firebase Security Rules to protect your database
5. ✅ Monitor your Metered.ca usage dashboard

## If Credentials Are Exposed

If you accidentally commit credentials to Git:

1. **Rotate immediately**:
   - Firebase: Generate new API keys in Firebase Console
   - Metered: Regenerate API key in Metered dashboard

2. **Clean Git history** (if needed):
   ```bash
   git filter-branch --force --index-filter \
   "git rm --cached --ignore-unmatch public/js/firebase-config.js" \
   --prune-empty --tag-name-filter cat -- --all
   ```

3. **Force push** (if repository is private and you control all clones):
   ```bash
   git push origin --force --all
   ```

## Additional Security

### Firebase Security Rules

Ensure your Firebase Realtime Database has proper security rules. Example:

```json
{
  "rules": {
    "users": {
      "$uid": {
        ".read": "$uid === auth.uid",
        ".write": "$uid === auth.uid"
      }
    },
    "calls": {
      "$callId": {
        ".read": "auth != null",
        ".write": "auth != null"
      }
    }
  }
}
```

### Metered API Rate Limiting

Monitor your Metered.ca dashboard for unexpected usage spikes, which might indicate API key abuse.
