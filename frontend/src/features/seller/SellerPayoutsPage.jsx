
import { useEffect, useState } from "react";
import { money } from "../../data/marketplace";
import { Empty, Stat } from "../workspace/WorkspaceFrame";
import SellerFrame from "./SellerFrame";
import { useSeller } from "./useSeller";
import {
  getAvailableBalance,
  getTotalPayout,
} from "./earnings";
import {
  payoutStore,
  PAYOUT_STATUSES,
} from "./payoutStore";

const dateTime = (value) =>
  value ? new Date(value).toLocaleString("id-ID") : "-";

export default function SellerPayoutsPage() {
  const { profile, bookings } = useSeller();

  const [, setRevision] = useState(0);
  const [bankName, setBankName] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState("");

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    return payoutStore.subscribe(() => {
      setRevision((value) => value + 1);
    });
  }, []);

  const accounts = profile
    ? payoutStore.listAccounts(profile.id)
    : [];

  const payouts = profile
    ? payoutStore.list(profile.id)
    : [];

  const availableBalance = getAvailableBalance(
    bookings,
    payouts
  );

  const totalPayout = getTotalPayout(payouts);

  function refresh() {
    setRevision((value) => value + 1);
  }

  function handleAddAccount(event) {
    event.preventDefault();
    setError("");
    setSuccess("");

    try {
      if (!profile) {
        throw new Error("Profil Seller tidak ditemukan.");
      }

      const account = payoutStore.addAccount(profile.id, {
        bankName,
        accountName,
        accountNumber,
      });

      setAccountId(account.id);
      setBankName("");
      setAccountName("");
      setAccountNumber("");

      setSuccess("Rekening pencairan berhasil ditambahkan.");
      refresh();
    } catch (failure) {
      setError(failure.message);
    }
  }

  function handleRequestPayout(event) {
    event.preventDefault();
    setError("");
    setSuccess("");

    try {
      if (!profile) {
        throw new Error("Profil Seller tidak ditemukan.");
      }

      if (!accountId) {
        throw new Error("Pilih rekening tujuan pencairan.");
      }

      const nominal = Number(amount);

      if (!Number.isSafeInteger(nominal) || nominal <= 0) {
        throw new Error("Masukkan nominal pencairan yang valid.");
      }

      payoutStore.request({
        sellerId: profile.id,
        accountId,
        amount: nominal,
        bookings,
      });

      setAmount("");
      setSuccess("Permintaan pencairan berhasil diajukan.");
      refresh();
    } catch (failure) {
      setError(failure.message);
    }
  }

  return (
    <SellerFrame
      title="Withdraw & Payout."
      description="Kelola rekening tujuan, ajukan pencairan saldo, dan pantau riwayat pencairan pendapatan Seller."
    >
      {error && (
        <p className="ws-alert" role="alert">
          {error}
        </p>
      )}

      {success && (
        <p className="ws-alert" role="status">
          {success}
        </p>
      )}

      <div className="ws-stats">
        <Stat
          label="Available balance"
          value={money(availableBalance)}
          note="Saldo dari pekerjaan yang telah selesai, dikurangi payout yang masih dipesan"
        />

        <Stat
          label="Total payout"
          value={money(totalPayout)}
          note="Pencairan dengan status Paid Out"
        />

        <Stat
          label="Total requests"
          value={payouts.length}
          note="Seluruh permintaan pencairan"
        />
      </div>

      <section className="ws-section">
        <header>
          <h2>Rekening pencairan.</h2>
        </header>

        {accounts.length > 0 && (
          <div className="ws-table-wrap">
            <table className="ws-table">
              <thead>
                <tr>
                  <th>Bank</th>
                  <th>Nama pemilik</th>
                  <th>Nomor rekening</th>
                </tr>
              </thead>

              <tbody>
                {accounts.map((account) => (
                  <tr key={account.id}>
                    <td>{account.bankName}</td>
                    <td>{account.accountName}</td>
                    <td>{account.accountNumber}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <form
          className="ws-form"
          onSubmit={handleAddAccount}
        >
          <h3>Tambah rekening baru</h3>

          <label className="field">
            Nama bank
            <input
              className="field__control"
              value={bankName}
              onChange={(event) => setBankName(event.target.value)}
              placeholder="Contoh: BCA, BRI, Mandiri"
              required
            />
          </label>

          <label className="field">
            Nama pemilik rekening
            <input
              className="field__control"
              value={accountName}
              onChange={(event) => setAccountName(event.target.value)}
              placeholder="Nama sesuai rekening"
              required
            />
          </label>

          <label className="field">
            Nomor rekening
            <input
              className="field__control"
              inputMode="numeric"
              value={accountNumber}
              onChange={(event) => setAccountNumber(event.target.value)}
              placeholder="Masukkan nomor rekening"
              required
            />
          </label>

          <button
            className="button button--secondary"
            type="submit"
          >
            Tambahkan rekening
          </button>
        </form>
      </section>

      <section className="ws-section">
        <header>
          <h2>Ajukan pencairan.</h2>
        </header>

        <form
          className="ws-form"
          onSubmit={handleRequestPayout}
        >
          <label className="field">
            Rekening tujuan
            <select
              className="field__control"
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
              required
            >
              <option value="">Pilih rekening</option>

              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.bankName} - {account.accountName} (
                  {account.accountNumber})
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            Nominal pencairan
            <input
              className="field__control"
              type="number"
              min="1"
              step="1"
              max={availableBalance}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="Masukkan nominal pencairan"
              required
            />
          </label>

          <p>
            Saldo tersedia: <strong>{money(availableBalance)}</strong>
          </p>

          <button
            className="button button--primary"
            type="submit"
            disabled={
              !accounts.length ||
              availableBalance <= 0
            }
          >
            Ajukan pencairan
          </button>
        </form>
      </section>

      <section className="ws-section">
        <header>
          <h2>Riwayat pencairan.</h2>
        </header>

        {!payouts.length ? (
          <Empty title="Belum ada pencairan.">
            Permintaan pencairan yang diajukan akan muncul di sini.
          </Empty>
        ) : (
          <div className="ws-table-wrap">
            <table className="ws-table">
              <thead>
                <tr>
                  <th>ID payout</th>
                  <th>Rekening tujuan</th>
                  <th>Nominal</th>
                  <th>Tanggal pengajuan</th>
                  <th>Status</th>
                  <th>Riwayat</th>
                </tr>
              </thead>

              <tbody>
                {payouts.map((payout) => (
                  <tr key={payout.id}>
                    <td>{payout.id}</td>

                    <td>
                      {payout.account.bankName}
                      <br />
                      {payout.account.accountName}
                      <br />
                      {payout.account.accountNumber}
                    </td>

                    <td>{money(payout.amount)}</td>

                    <td>{dateTime(payout.requestedAt)}</td>

                    <td>{payout.status}</td>

                    <td>
                      <details>
                        <summary>Lihat riwayat</summary>

                        <ol>
                          {payout.history.map((event, index) => (
                            <li key={`${payout.id}-${index}`}>
                              {event.status}
                              {" · "}
                              {dateTime(event.at)}
                            </li>
                          ))}
                        </ol>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="ws-section">
        <header>
          <h2>Keterangan status payout.</h2>
        </header>

        <ul>
          {PAYOUT_STATUSES.map((item) => (
            <li key={item}>
              <strong>{item}</strong>
            </li>
          ))}
        </ul>
      </section>
    </SellerFrame>
  );
}