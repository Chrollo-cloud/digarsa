export const bookingDate = (date) =>
  date
    ? new Intl.DateTimeFormat("id-ID", { dateStyle: "long" }).format(
        new Date(`${date}T00:00:00`),
      )
    : "Jadwal fleksibel";
