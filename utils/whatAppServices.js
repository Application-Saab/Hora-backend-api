const axios = require("axios");
const sendWhatsApp = async (mobile) => {
    console.log("sending -----------")
    let formatted = mobile.startsWith("+91") ? mobile : "+91" + mobile;

    try {
        const res = await axios.post(
            "https://public.doubletick.io/whatsapp/message/template",
            {
                messages: [
                    {
                        from: "+917338584828",
                        to: formatted,
                        content: {
                            templateName: "happy_to_help_v2",
                            language: "en",
                            templateData: {
                                header: {
                                    type: "IMAGE",
                                    mediaUrl:
                                        "https://quickscale-template-media.s3.ap-south-1.amazonaws.com/org_FGdNfMoTi9/2a2f1b0c-63e0-4c3e-a0fb-7ba269f23014.jpeg",
                                },
                                body: { placeholders: ["Hora Services"] },
                                buttons: [
                                    {
                                        type: "URL",
                                        url: "https://your-website.com"
                                    }
                                ]
                            },
                        },
                    },
                ],
            },
            {
                headers: {
                    accept: "application/json",
                    "content-type": "application/json",
                    Authorization: "key_fHOm5tEzbfSWRbC29LoZkYd0vpqaU7B22Q2iSL2vgawcN3k0D75iXNSPRen3ie7Qj3L7C6r5EhH4lLYeL1dCtPj9WyQ9wPm2abK1wltW8bYXVR5xvjLfPeQgfRld3ws1lkkRduX6tfrHbmYnbhbYnau3HSfJAylSmBso4m5qjO7vm4YjbhtqMbdkNK2EoNPXqM5SdxThyeGvSlvoA8JCVhGvL98yrocJJ7JfhBasgsEnN7qArGvPdsswdhys",
                },
            },
        );
        console.log("RESPONSE:", JSON.stringify(res.data, null, 2));
    } catch (err) {
        console.error("WhatsApp error", err);
    }
};

module.exports = { sendWhatsApp };
