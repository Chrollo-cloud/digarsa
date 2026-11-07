import { useId, useState } from "react";

export default function PasswordInput({ autoComplete, ...props }) {
  const [visible, setVisible] = useState(false);
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>Kata sandi</label>
      <div className="account-password">
        <input
          {...props}
          id={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          className="field__control"
        />
        <button
          type="button"
          aria-label={
            visible ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"
          }
          aria-pressed={visible}
          onClick={() => setVisible(!visible)}
        >
          {visible ? "Sembunyikan" : "Lihat"}
        </button>
      </div>
    </div>
  );
}
