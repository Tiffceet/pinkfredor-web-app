import { google } from "googleapis";
import * as jwt from "jsonwebtoken";
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
    type: RequestType.GET,
    content: {
        fileid: RequestBodyDataType.STRING,
        token: RequestBodyDataType.STRING,
    },
};

const download_v2 = async (req: any, res: any) => {
    if (!verify_request_body(req, res, __schema_download)) {
        return;
    }

    // ============================
    // Manual token check Start
    // ============================
    const bearerToken = req.query.token;

    let user;
    try {
        user = jwt.verify(bearerToken, env.API_SECRET);
    } catch (err: any) {
        return res.status(403).json({ message: "Unauthorized User" });
    }
    let jwt_payload = user as any;
    if (Date.now() > jwt_payload.exp * 1000) {
        return res
            .status(401)
            .json({ message: "Token Expired", expired: true });
    }
    if (Date.now() < jwt_payload.iat * 1000) {
        return res.status(401).json({ message: "Invalid Token" });
    }
    req.app_user = user;
    // ============================
    // Manual Token Check end
    // ============================

    // Check if drive is linked
    let doc = db.collection("drive-api-tokens").doc(req.app_user.id);
    let doc_data = await doc.get();
    if (!doc_data.exists) {
        res.json({ message: "Google drive is not linked" });
        return;
    }

    let file_id = req.query.fileid;
    let oAuth2Client = new google.auth.OAuth2(
        (env.DRIVE_CREDENTIAL as any).client_id,
        (env.DRIVE_CREDENTIAL as any).client_secret,
        (env.DRIVE_CREDENTIAL as any).redirect_uri
    );
    oAuth2Client.setCredentials(doc_data.data());
    let drive = google.drive({ version: "v3", auth: oAuth2Client });
    let test: any;

    // Read file metadata scanned
    doc = db.collection("index-files").doc(req.app_user.id);
    let doc_get = await doc.get();
    if (!doc_get.exists) {
        res.status(404);
        res.json({
            message:
                "Please perform a scan, unable to locate file_id from existing index",
        });
        return;
    }

    let idx:any = doc_get.data().files;
    let file_metadata = idx[file_id];
    if(!file_metadata) {
        res.status(404);
        res.json({
            message:
                "Please perform a scan, unable to locate file_id from existing index",
        });
        return;
    }


    let filesize = file_metadata.size;
    try {
        if (req.headers.range) {
            let range = req.headers.range;
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : filesize - 1;
            test = await drive.files.get(
                {
                    fileId: file_id,
                    alt: "media",
                },
                {
                    responseType: "stream",
                    headers: {
                        Range: `bytes=${start}-${end}`,
                    },
                }
            );
            res.writeHead(206, {
                "Content-Type": "audio/mpeg",
                "Content-Range": `bytes ${start}-${end}/${filesize}`,
                "Accept-Ranges": "bytes",
                "Content-Length": `${end - start + 1}`,
            });
            test.data.pipe(res);
        } else {
            test = await drive.files.get(
                {
                    fileId: file_id,
                    alt: "media",
                },
                {
                    responseType: "stream",
                }
            );
            res.writeHead(200, {
                "Content-Type": "audio/mpeg",
            });
            test.data.pipe(res);
        }
    } catch (err: any) {
        res.status(404);
        res.json({ message: "File not found." });
        return;
    }

    // res.writeHead(200, {
    //     "Content-Type": "application/octet-stream",
    // });
    // test.data.pipe(res);
};

export default download_v2;
