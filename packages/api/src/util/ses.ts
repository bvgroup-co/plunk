import { SES } from "@aws-sdk/client-ses";
import { AWS_ACCESS_KEY_ID, AWS_REGION, AWS_SECRET_ACCESS_KEY } from "../app/constants";

let sesClient: SES | null = null;

function getSes(): SES {
	if (!sesClient) {
		sesClient = new SES({
			apiVersion: "2010-12-01",
			region: AWS_REGION,
			credentials: {
				accessKeyId: AWS_ACCESS_KEY_ID,
				secretAccessKey: AWS_SECRET_ACCESS_KEY,
			},
		});
	}

	return sesClient;
}

export const ses = new Proxy({} as SES, {
	get(_target, property: keyof SES) {
		const client = getSes();
		const value = client[property];

		if (typeof value === "function") {
			return value.bind(client);
		}

		return value;
	},
});

export const getIdentities = async (identities: string[]) => {
	const res = await getSes().getIdentityVerificationAttributes({
		Identities: identities.flatMap((identity) => [identity.split("@")[1]]),
	});

	const parsedResult = Object.entries(res.VerificationAttributes ?? {});
	return parsedResult.map((obj) => {
		return { email: obj[0], status: obj[1].VerificationStatus };
	});
};

export const verifyIdentity = async (email: string) => {
	const DKIM = await getSes().verifyDomainDkim({
		Domain: email.includes("@") ? email.split("@")[1] : email,
	});

	await getSes().setIdentityMailFromDomain({
		Identity: email.includes("@") ? email.split("@")[1] : email,
		MailFromDomain: `plunk.${email.includes("@") ? email.split("@")[1] : email}`,
	});

	return DKIM.DkimTokens;
};

export const getIdentityVerificationAttributes = async (email: string) => {
	const attributes = await getSes().getIdentityDkimAttributes({
		Identities: [email, email.split("@")[1]],
	});

	const parsedAttributes = Object.entries(attributes.DkimAttributes ?? {});

	return {
		email: parsedAttributes[0][0],
		tokens: parsedAttributes[0][1].DkimTokens,
		status: parsedAttributes[0][1].DkimVerificationStatus,
	};
};
