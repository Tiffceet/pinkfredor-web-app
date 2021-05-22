import { google } from "googleapis";
import {
    RequestBodyDataType,
    RequestSchema,
    RequestType,
} from "../../../util/interface/RequestSchema";
import { db } from "../../../firebase";
import { verify_request_body } from "../../../util/verify_request_body";
import { env } from "../../../env";
import * as fs from "fs";
const __schema_download: RequestSchema = {
    type: RequestType.POST,
    content: {
        fileid: RequestBodyDataType.STRING,
    },
};

const download = async (req: any, res: any) => {
    if (!verify_request_body(req, res, __schema_download)) {
        return;
    }

    // Check if drive is linked
    let doc = db.collection("drive-api-tokens").doc(req.app_user.id);
    let doc_data = await doc.get();
    if (!doc_data.exists) {
        res.json({ message: "Google drive is not linked" });
        return;
    }

    let file_id = req.body.fileid;
    let oAuth2Client = new google.auth.OAuth2(
        (env.DRIVE_CREDENTIAL as any).client_id,
        (env.DRIVE_CREDENTIAL as any).client_secret,
        (env.DRIVE_CREDENTIAL as any).redirect_uri
    );
    oAuth2Client.setCredentials(doc_data.data());
    let drive = google.drive({ version: "v3", auth: oAuth2Client });
    let test: any;
    try {
        test = await drive.files.get(
            {
                fileId: file_id,
                alt: "media",
            },
            { responseType: "stream" }
        );
    } catch (err: any) {
        res.status(404);
        res.json({ message: "File not found." });
        return;
    }

    const f_name = `${req.app_user.id}-${Date.now()}.mp3`;
    let f = fs.createWriteStream(f_name);

    test.data
        .on("end", () => {
            let f2 = fs.readFileSync(f_name, {encoding: 'base64'});
            res.json({
                b64: f2
            });
            fs.unlink(f_name,(err:any)=>{console.error(err)});
        })
        .pipe(f);
    // res.send(test);
};

export default download;