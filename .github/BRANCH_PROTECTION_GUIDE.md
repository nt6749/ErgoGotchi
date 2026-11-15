# 🛡️ GitHub Ruleset & Branch Protection Guide for `main`
> **How to lock down `main` so bad merges and broken commits can NEVER enter production.**

---

## ⚡ 1-Minute Setup in GitHub Web UI

1. Open your repository on GitHub:  
   👉 **[https://github.com/nt6749/ErgoGotchi/settings/rules](https://github.com/nt6749/ErgoGotchi/settings/rules)**
2. Click **"New ruleset"** ➔ **"New branch ruleset"**.
3. Set **Ruleset Name**: `Protect Main Branch`.
4. Set **Enforcement status**: `Active`.
5. Under **Target branches**, click **"Add target"** ➔ select **"Include default branch"** (`main`).

---

## 📋 Rules to Enable (Check the boxes):

### 1. Restrict Deletions
- ☑️ **Restrict deletions** *(Prevents anyone from accidentally deleting `main`)*

### 2. Block Force Pushes
- ☑️ **Block force pushes** *(Prevents `git push --force` from overwriting commit history)*

### 3. Require a Pull Request Before Merging
- ☑️ **Require a pull request before merging**
  - Required approvals: `1`
  - ☑️ **Dismiss stale pull request approvals when new commits are pushed**
  - ☑️ **Require review from Code Owners** *(Enforces `.github/CODEOWNERS` so Dev 1, Dev 2, and Dev 3 approve their respective code areas)*

### 4. Require Status Checks to Pass (CI Gatekeeper)
- ☑️ **Require status checks to pass before merging**
  - ☑️ **Require branches to be up to date before merging**
  - Click **"Add checks"** and search for:  
    👉 **`Verify Tests & Compilation`** *(from `.github/workflows/ci.yml`)*
  - This ensures that if `npm test` or `pytest` fails, GitHub physically disables the "Merge" button!

6. Click **"Save changes"** at the bottom!

---

## 🔒 What This Gives You:
| Threat | How ErgoGotchi Ruleset Protects You |
| :--- | :--- |
| **Accidental direct push to main** | Local `.githooks/pre-push` rejects the command in the terminal; GitHub rejects it on the server. |
| **Failing tests breaking main** | GitHub Actions runs `.github/workflows/ci.yml` and blocks merging if Vitest or Pytest fails. |
| **Conflicting domain edits** | `.github/CODEOWNERS` alerts domain owners if someone edits files outside their folder. |
| **Force-push history rewrite** | Blocked permanently. |
