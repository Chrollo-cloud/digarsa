type UserRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  birthDate: Date | null;
  gender: string | null;
  avatarUrl: string | null;
  role: "USER" | "ADMIN";
  createdAt: Date;
};

type SellerRow = { id: string; verificationStatus: "PENDING" | "APPROVED" | "REJECTED" } | null;

export function toFrontendAccount(user: UserRow, seller: SellerRow) {
  const sellerProfileId = seller?.id ?? null;
  const hasApprovedSellerCapability = seller?.verificationStatus === "APPROVED";
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone ?? "",
    birthDate: user.birthDate?.toISOString().slice(0, 10) ?? "",
    gender: user.gender ?? "",
    avatarUrl: user.avatarUrl ?? "",
    createdAt: user.createdAt.toISOString(),
    sellerProfileId,
    capabilities: ["buyer", ...(hasApprovedSellerCapability ? ["seller"] : [])],
    permissions: user.role === "ADMIN" ? ["admin:access"] : [],
  };
}
