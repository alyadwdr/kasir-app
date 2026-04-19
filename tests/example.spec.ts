import { test, expect } from '@playwright/test';

// Kita kelompokkan tes dalam satu 'describe' block untuk Login
test.describe('Regression Test: Halaman Login Kasir', () => {

  // Sebelum setiap tes, buka halaman login
  test.beforeEach(async ({ page }) => {
    await page.goto('https://qashier-web.vercel.app/');
  });

  test('User harus bisa login dengan kredensial yang valid', async ({ page }) => {
    // 1. Masukkan Email
    await page.getByTestId('email-input').fill('qashieraja@gmail.com');

    // 2. Masukkan Password
    await page.getByTestId('password-input').fill('balqisenfp');

    // 3. Klik tombol Masuk
    await page.getByTestId('login-button').click();

    // 4. Verifikasi: Jika login berhasil, biasanya URL berubah atau muncul elemen dashboard
    // Kita tunggu sampai URL berubah (sesuaikan jika ada redirect ke /dashboard)
    await expect(page).not.toHaveURL(/.*login/); 
    
    // Opsional: Cek apakah ada elemen yang hanya muncul setelah login
    // await expect(page.getByText('Logout')).toBeVisible();
  });

  test('Muncul pesan error jika password salah', async ({ page }) => {
    await page.getByTestId('email-input').fill('qashieraja@gmail.com');
    await page.getByTestId('password-input').fill('salahpassword');
    await page.getByTestId('login-button').click();

    // Verifikasi pesan error muncul
    const errorMessage = page.getByTestId('login-error');
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).toHaveText('Email atau password salah. Silakan coba lagi.');
  });

  test('Fitur show/hide password berfungsi', async ({ page }) => {
    const passwordInput = page.getByTestId('password-input');
    const toggleBtn = page.getByTestId('toggle-password');

    // Defaultnya harus bertipe password (tertutup)
    await expect(passwordInput).toHaveAttribute('type', 'password');

    // Klik tombol mata
    await toggleBtn.click();

    // Sekarang tipenya harus text (terlihat)
    await expect(passwordInput).toHaveAttribute('type', 'text');
  });
});