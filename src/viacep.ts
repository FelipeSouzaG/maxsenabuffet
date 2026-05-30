export type ViaCepAddress = {
  street: string;
  district: string;
  city: string;
  state: string;
};

export async function fetchAddressByCep(
  cepDigits: string,
): Promise<{ ok: true; address: ViaCepAddress } | { ok: false; error: string }> {
  if (cepDigits.length !== 8) {
    return { ok: false, error: "CEP deve ter 8 dígitos" };
  }

  try {
    const response = await fetch(`https://viacep.com.br/ws/${cepDigits}/json/`);
    if (!response.ok) {
      return { ok: false, error: "CEP inválido" };
    }

    const data = (await response.json()) as Record<string, unknown>;
    if (data?.erro) {
      return { ok: false, error: "CEP não encontrado" };
    }

    return {
      ok: true,
      address: {
        street: String(data.logradouro || "").trim(),
        district: String(data.bairro || "").trim(),
        city: String(data.localidade || "").trim(),
        state: String(data.uf || "")
          .trim()
          .toUpperCase()
          .slice(0, 2),
      },
    };
  } catch {
    return { ok: false, error: "Falha na consulta do CEP" };
  }
}
