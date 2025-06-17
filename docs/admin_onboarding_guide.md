# 🛡️ Admin Onboarding & API Guide

This document consolidates all information necessary to understand, use, and extend the administrator management system within the Dungeons & Dragons (DyD) platform.

---

## 📋 Overview

The admin system enables secure and flexible management of users with elevated permissions. It consists of:

- A visual dashboard interface: `/dashboard/admin`
- REST API endpoints under: `/api/admin`
- A MongoDB-based user role system

---

## 👥 User Roles

| Role               | Permissions                                            |
| ------------------ | ------------------------------------------------------ |
| Superadministrator | Full access: create, edit, delete admins               |
| Administrator      | Can manage content; cannot manage other administrators |
| Regular User       | Cannot access admin panel                              |

---

## 🔐 Security Principles

1. Only superadmins can create or delete admins.
2. All actions require valid authentication.
3. Input validation is enforced at every level.

---

## 🧭 Admin Panel Guide (`/dashboard/admin`)

### ➕ Add a New Administrator

1. Navigate to the `/dashboard/admin` panel.
2. Click **"New admin"**.
3. Fill in:
   - **User ID** (must exist in the system)
   - **Admin** checkbox
4. Click **"Create"**.
5. Upon success, the new admin will appear in the list.

### ✏️ Edit an Administrator

1. Locate the admin in the list.
2. Click **Edit**.
3. Modify role, then click **Update**.

### 🗑️ Delete an Administrator

1. Locate the admin in the list.
2. Click **Delete**, then confirm.

---

## 🚀 Admin API Reference

### 🔎 `GET /api/admin`

Retrieve all admins.

#### ✅ Response

```json
[
  { "userId": "123", "isAdmin": true },
  { "userId": "456", "isAdmin": false }
]
```

### ➕ `POST /api/admin`

Create a new admin.

#### 📥 Body

```json
{ "userId": "new_user", "isAdmin": true }
```

#### ✅ Response

```json
{ "userId": "new_user", "isAdmin": true }
```

### ✏️ `PUT /api/admin`

Update admin status.

#### 📥 Body

```json
{ "userId": "existing_user", "isAdmin": false }
```

#### ✅ Response

```json
{ "userId": "existing_user", "isAdmin": false }
```

### 🗑️ `DELETE /api/admin`

Delete an admin.

#### 📥 Body

```json
{ "userId": "admin_to_delete" }
```

#### ✅ Response

```json
{ "message": "Admin deleted" }
```

---

## 💻 Usage Examples

### Fetch All Admins

```js
const res = await fetch("/api/admin");
const data = await res.json();
```

### Create Admin

```js
await fetch("/api/admin", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ userId: "new_user", isAdmin: true })
});
```

### Update Admin

```js
await fetch("/api/admin", {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ userId: "admin123", isAdmin: false })
});
```

### Delete Admin

```js
await fetch("/api/admin", {
  method: "DELETE",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ userId: "admin123" })
});
```

---

## 🛠️ Troubleshooting

- Ensure the `userId` exists.
- Check network stability.
- Confirm you have superadmin privileges.

For persistent issues, contact technical support.

---

✅ This document is up-to-date with all admin creation, role management, and backend access methods.

