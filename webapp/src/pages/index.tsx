import { GymInterpLineResponse, GymResponse } from "@/api/Backend";
import { useBackendContext } from "@/components/BackendProvider";
import { ApexOptions } from "apexcharts";
import React from "react";
import { useEffect, useState } from "react";
import { EMBED_CODE } from "./embed_gym";

const ReactApexChart = React.lazy(() => import("react-apexcharts"));

function LiveStatusCard({ gym, gymLine }: { gym: GymResponse; gymLine: GymInterpLineResponse }) {
    // Get current utilization from latest data point
    const currentUtil =
        gym.data_today.length > 0 ? gym.data_today[gym.data_today.length - 1].auslastung : null;

    // Get current hour for week-over-week comparison
    const getCurrentHour = () => {
        if (gym.data_today.length === 0) return null;
        return new Date(gym.data_today[gym.data_today.length - 1].created_at).getHours();
    };
    const currentHour = getCurrentHour();

    // Get utilization from same time last week (data_historic[0] is 1 week ago)
    const getLastWeekUtil = () => {
        if (
            !gym.data_historic ||
            gym.data_historic.length === 0 ||
            gym.data_historic[0].length === 0 ||
            currentHour === null
        )
            return null;
        const lastWeek = gym.data_historic[0];
        // Find closest time slot by hour
        let closest = lastWeek[0];
        let minDiff = 24;
        for (const point of lastWeek) {
            const diff = Math.abs(new Date(point.created_at).getHours() - currentHour);
            if (diff < minDiff) {
                minDiff = diff;
                closest = point;
            }
        }
        return closest.auslastung;
    };
    const lastWeekUtil = getLastWeekUtil();

    // Calculate week-over-week change
    const getWowChange = () => {
        if (currentUtil === null || lastWeekUtil === null || lastWeekUtil === 0) return null;
        return ((currentUtil - lastWeekUtil) / lastWeekUtil) * 100;
    };
    const wowChange = getWowChange();

    // Calculate trend from last 3 data points
    const getTrend = () => {
        if (gym.data_today.length < 3) return null;
        const recent = gym.data_today.slice(-3);
        const first = recent[0].auslastung;
        const last = recent[recent.length - 1].auslastung;
        const diff = last - first;
        if (Math.abs(diff) < 5) return "stable";
        return diff > 0 ? "rising" : "falling";
    };
    const trend = getTrend();

    // Get prediction for next hour from interpLine
    const getNextHourPrediction = () => {
        if (!gymLine.interpLine || gymLine.interpLine.length === 0) return null;
        const now = new Date();
        const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);
        let closest = gymLine.interpLine[0];
        let minDiff = Math.abs(new Date(closest.created_at).getTime() - oneHourLater.getTime());
        for (const point of gymLine.interpLine) {
            const diff = Math.abs(new Date(point.created_at).getTime() - oneHourLater.getTime());
            if (diff < minDiff) {
                minDiff = diff;
                closest = point;
            }
        }
        return closest.auslastung;
    };
    const nextHourPred = getNextHourPrediction();

    // Get status label and color
    const getStatus = (util: number) => {
        if (util < 30) return { label: "Empty", color: "text-success" };
        if (util < 60) return { label: "Moderate", color: "text-warning" };
        if (util < 80) return { label: "Busy", color: "text-warning" };
        return { label: "Very Busy", color: "text-danger" };
    };

    // Gym mood based on utilization
    const getMood = (util: number) => {
        if (util < 20) return "😌";  // Super empty - relaxed
        if (util < 40) return "🙂";  // Empty - good mood
        if (util < 60) return "😐";  // Moderate - neutral
        if (util < 80) return "😰";  // Busy - stressed
        return "😱";  // Very busy - panicked
    };

    // Check for "Gym Jackpot" - gym is almost empty!
    const isJackpot = currentUtil !== null && currentUtil < 15;

    // Data freshness - how old is the latest data point?
    const getDataAge = () => {
        if (!gym?.data_today || gym.data_today.length === 0) return null;
        const latestTime = new Date(gym.data_today[gym.data_today.length - 1].created_at);
        const now = new Date();
        const ageMs = now.getTime() - latestTime.getTime();
        const ageMins = Math.floor(ageMs / 60000);
        return ageMins;
    };
    const dataAge = getDataAge();

    // All-time high comparison
    const getAllTimeHigh = () => {
        if (!gym?.data_today || gym.data_today.length === 0) return null;
        return Math.max(...gym.data_today.map(d => d.auslastung));
    };
    const todayHigh = getAllTimeHigh();

    // Random gym facts based on time of day
    const getGymFact = () => {
        const hour = new Date().getHours();
        if (hour >= 6 && hour < 9) return "🌅 Morning gym-goers are 40% more consistent!";
        if (hour >= 9 && hour < 12) return "📚 Most students study before noon, gym is quieter!";
        if (hour >= 12 && hour < 14) return "🍽️ Lunch rush! Gym empties around 12-13.";
        if (hour >= 14 && hour < 17) return "📖 Afternoon grind begins, gym gets busy!";
        if (hour >= 17 && hour < 19) return "🌆 Peak hours! 5-7 PM is busiest.";
        if (hour >= 19 && hour < 21) return "🌙 Evening gym-goers stay longer!";
        if (hour >= 21) return "🌃 Late night - dedicated gym rats only!";
        return null;
    };
    const gymFact = getGymFact();

    const mood = currentUtil !== null ? getMood(currentUtil) : null;

    const trendIcon = trend === "rising" ? "↗" : trend === "falling" ? "↘" : "→";
    const trendColor =
        trend === "rising" ? "text-danger" : trend === "falling" ? "text-success" : "text-muted";
    const status = currentUtil !== null ? getStatus(currentUtil) : null;

    // Week-over-week colors and formatting
    const wowColor =
        wowChange === null
            ? "text-muted"
            : wowChange > 5
              ? "text-danger"
              : wowChange < -5
                ? "text-success"
                : "text-muted";
    const wowIcon = wowChange === null ? "" : wowChange > 0 ? "↗" : wowChange < 0 ? "↘" : "→";
    const wowText =
        wowChange === null ? "—" : (wowChange > 0 ? "+" : "") + wowChange.toFixed(0) + "%";

    if (currentUtil === null) return null;

    return (
        <div className="card bg-dark shadow-lg mb-3">
            <div className="card-body py-2">
                <div className="row text-center">
                    <div className="col-3">
                        <h6 className="text-muted mb-1">Now {mood}</h6>
                        <h4 className={status?.color + " mb-0"}>{currentUtil.toFixed(0)}%</h4>
                        <small className="text-muted">{status?.label}</small>
                    </div>
                    <div className="col-3">
                        <h6 className="text-muted mb-1">Vs Last Week</h6>
                        <h4 className={wowColor + " mb-0"}>
                            {wowIcon} {wowText}
                        </h4>
                        <small className="text-muted">
                            {lastWeekUtil !== null
                                ? lastWeekUtil.toFixed(0) + "% last wk"
                                : "no data"}
                        </small>
                    </div>
                    <div className="col-3">
                        <h6 className="text-muted mb-1">Trend</h6>
                        <h4 className={trendColor + " mb-0"}>
                            {trendIcon}{" "}
                            {trend === "rising"
                                ? "Rising"
                                : trend === "falling"
                                  ? "Falling"
                                  : "Stable"}
                        </h4>
                    </div>
                    <div className="col-3">
                        <h6 className="text-muted mb-1"> 预测 1h</h6>
                        <h4 className={getStatus(nextHourPred || 0).color + " mb-0"}>
                            {nextHourPred !== null ? nextHourPred.toFixed(0) + "%" : "—"}
                        </h4>
                        <small className="text-muted">
                            {nextHourPred !== null ? getStatus(nextHourPred).label : ""}
                        </small>
                    </div>
                    <div className="col-3">
                        <h6 className="text-muted mb-1">Get busier?</h6>
                        {(() => {
                            if (currentUtil === null || nextHourPred === null) return <h4 className="text-muted mb-0">—</h4>;
                            const willGetBusier = nextHourPred > currentUtil + 5;
                            const willGetQuieter = nextHourPred < currentUtil - 5;
                            if (willGetBusier) return <h4 className="text-danger mb-0">📈 Yes ↑</h4>;
                            if (willGetQuieter) return <h4 className="text-success mb-0">📉 No ↓</h4>;
                            return <h4 className="text-muted mb-0">➖ Same</h4>;
                        })()}
                    </div>
                </div>
                {gymLine?.interpLine && (
                    <div className="mt-2 pt-2 border-top border-secondary">
                        {dataAge !== null && (
                            <div className="d-flex justify-content-between small">
                                <span className="text-muted">
                                    {dataAge < 5 ? "🟢" : dataAge < 15 ? "🟡" : "🔴"} Data: {dataAge} min ago
                                </span>
                                {todayHigh !== null && gymLine.allTimeHigh !== undefined && (
                                    <span className="text-muted">
                                        {todayHigh >= gymLine.allTimeHigh ? "🏆 Today's High!" : `🏃 High: ${gymLine.allTimeHigh}%`}
                                    </span>
                                )}
                            </div>
                        )}
                        {gymFact && (
                            <div className="small text-info mt-1">{gymFact}</div>
                        )}
                        <small className="text-muted">
                            {(() => {
                                if (!gymLine.interpLine || gymLine.interpLine.length === 0) return null;
                                const now = new Date();
                                const currentHour = now.getHours();
                                // Check if we're approaching typical peak (5-7pm = 17-19)
                                const approachingPeak = currentHour >= 16 && currentHour < 17 && currentUtil !== null && currentUtil > 50;
                                if (approachingPeak) {
                                    return <span className="text-warning"><span className="me-1">⚠️</span>Peak hour approaching (5-7 PM)!</span>;
                                }
                                return null;
                            })()}
                            <span className="me-1">💡</span>
                            Best time in next 3h:{" "}
                            <span className="text-success fw-bold">
                                {(() => {
                                    if (!gymLine.interpLine || gymLine.interpLine.length === 0) return "—";
                                    const now = new Date();
                                    const threeHoursLater = new Date(now.getTime() + 3 * 60 * 60 * 1000);
                                    // Filter points within next 3 hours
                                    const upcomingPoints = gymLine.interpLine.filter(p => {
                                        const ptTime = new Date(p.created_at);
                                        return ptTime >= now && ptTime <= threeHoursLater;
                                    });
                                    if (upcomingPoints.length === 0) return "—";
                                    // Find the point with lowest utilization
                                    const best = upcomingPoints.reduce((min, p) =>
                                        p.auslastung < min.auslastung ? p : min, upcomingPoints[0]);
                                    const bestTime = new Date(best.created_at);
                                    return `${bestTime.getHours()}:00 (${best.auslastung.toFixed(0)}%)`;
                                })()}
                            </span>
                        </small>
                    </div>
                )}
            </div>
        </div>
    );
}

function ChartImpl({ gym, gymLine }: { gym: GymResponse; gymLine: GymInterpLineResponse }) {
    let todayReference;
    if (gym.data_today.length > 0) {
        todayReference = new Date(gym.data_today[0].created_at);
    } else if (
        gym.data_historic.length > 0 &&
        gym.data_historic[gym.data_historic.length - 1].length > 0
    ) {
        todayReference = new Date(gym.data_historic[gym.data_historic.length - 1][0].created_at);
    } else {
        return <div>No data</div>;
    }

    let adjustDate = (d: Date | string) => {
        if (typeof d === "string") {
            d = new Date(d);
        }
        d.setFullYear(
            todayReference.getFullYear(),
            todayReference.getMonth(),
            todayReference.getDate(),
        );
        return +d;
    };
    let data = gym.data_today.map((g) => ({
        ...g,
        created_at: Date.parse(g.created_at),
    }));
    data = data.sort((a, b) => a.created_at - b.created_at);

    let data_historic = gym.data_historic || [];
    let historicData = data_historic.map((week, index) =>
        week
            .map((g) => ({
                ...g,
                created_at: adjustDate(g.created_at),
            }))
            .sort((a, b) => a.created_at - b.created_at),
    );

    let minX = new Date(todayReference).setHours(6, 0, 0, 0);
    let maxX = new Date(todayReference).setHours(23, 59, 59, 999);

    const options: ApexOptions = {
        yaxis: {
            min: 0,
            max: (max) => Math.max(180, Math.ceil(max / 10) * 10),
            decimalsInFloat: 0,
            tickAmount: 6,
        },
        xaxis: {
            type: "datetime",
            min: minX,
            max: maxX,
            labels: {
                datetimeUTC: false,
            },
        },
        chart: {
            id: "gym",
            type: "area",
            animations: {
                enabled: false,
            },
        },
        dataLabels: {
            enabled: false,
        },
        stroke: {
            curve: "smooth",
            width: [3, 2, 2].concat(new Array(historicData.length).fill(1)),
            dashArray: [0, 1, 1].concat(new Array(historicData.length).fill(3)),
        },
        title: {
            text: "RWTH Gym Utilization",
            align: "left",
        },
        theme: {
            mode: "dark",
        },
        tooltip: {
            x: {
                format: "dd.MM.yyyy HH:mm",
            },
        },
        grid: {
            borderColor: "#636363",
            xaxis: {
                lines: {
                    show: true,
                },
            },
        },
        fill: {
            type: "solid",
            opacity: [0.4, 0.15, 0.15].concat(new Array(historicData.length).fill(0.02)),
        },
        annotations: {
            yaxis: [
                {
                    y: 160,
                    y2: 1000,
                    fillColor: "#FF0000",
                    opacity: 0.15,
                },
                {
                    y: 120,
                    y2: 160,
                    fillColor: "#ff8c00",
                    opacity: 0.15,
                },
            ],
            texts: [
                {
                    x: 200,
                    y: 100,
                    text: "https://rwtf.dorianko.ch/",
                    textAnchor: "start",
                    fontSize: "30px",
                    foreColor: "#888",
                },
            ],
        },
    };

    let historicArrivals = [];
    for (let i = 0; i < gymLine.interpLine.length; i++) {
        const g = gymLine.interpLine[i];
        let val = g.auslastung;
        let j = i - 1;
        let minTime = adjustDate(new Date(g.created_at)) - 1000 * 60 * 60 * 1.5; // 1.5 hrs
        while (j >= 0 && historicArrivals[j].created_at > minTime + 1000) {
            val -= Math.max(historicArrivals[j].arrival, 0);
            j--;
        }
        historicArrivals.push({
            created_at: adjustDate(new Date(g.created_at)),
            arrival: val,
        });
    }
    // smooth out the arrival data
    let smoothedArrivals = [];
    //smoothedArrivals.push(historicArrivals[0]);
    for (let i = 1; i < historicArrivals.length - 2; i++) {
        smoothedArrivals.push({
            created_at: historicArrivals[i].created_at,
            arrival:
                (historicArrivals[i - 1].arrival +
                    2 * historicArrivals[i].arrival +
                    historicArrivals[i + 1].arrival) /
                4,
        });
    }
    //smoothedArrivals.push(historicArrivals[historicArrivals.length - 1]);

    let series: ApexAxisChartSeries = [
        {
            name: "Utilization",
            zIndex: 1,
            data: data.map((g) => ({
                x: g.created_at,
                y: g.auslastung,
            })),
        },
        {
            name: "Prediction",
            data: gymLine.interpLine.map((g) => {
                const gDate = new Date(g.created_at);
                return {
                    x: adjustDate(gDate),
                    y: g.auslastung,
                };
            }),
        },
        {
            name: "Historic Arrival",
            data: smoothedArrivals.map((g) => ({
                x: g.created_at,
                y: g.arrival * (60 / 5), // correction factor
            })),
            hidden: true,
        },
    ];
    series = series.concat(
        historicData.map((week, index) => ({
            name: `${index + 1} Week(s) ago`,
            data: week.map((g) => ({
                x: g.created_at,
                y: g.auslastung,
            })),
            hidden: true,
        })),
    );

    return (
        <ReactApexChart
            id="gymchart"
            type="area"
            width={"100%"}
            height={500}
            options={options}
            series={series}
        />
    );
}

export function GymPlotWithHandles({ hideHandles = false }: { hideHandles?: boolean }) {
    const [gym, setGym] = useState<GymResponse>();
    const [gymLine, setGymLine] = useState<GymInterpLineResponse>();
    const [error, setError] = useState<string>();
    const [isLoading, setIsLoading] = useState(true);

    const days = ["Today", "Tomorrow", "+2 days", "+3 days"];
    const [dayoffset, setDayoffset] = useState(0);
    const api = useBackendContext();

    const reloadData = () => {
        setIsLoading(true);
        const prom = Promise.all([api.getGym(dayoffset), api.getGymInterpLine(dayoffset)]);
        prom.then((res) => {
            setGym(res[0]);
            setGymLine(res[1]);
            setError(undefined);
        })
            .catch((err) => {
                setGym(undefined);
                setGymLine(undefined);
                setError(err + "");
            })
            .then(() => {
                setIsLoading(false);
            });
    };

    useEffect(() => {
        reloadData();

        const tim = setInterval(
            () => {
                reloadData();
            },
            1000 * 60 * 4,
        ); // 4 minutes

        return () => {
            clearInterval(tim);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [api, dayoffset]);

    // Check for jackpot - gym is almost empty!
    const currentUtil = gym?.data_today && gym.data_today.length > 0
        ? gym.data_today[gym.data_today.length - 1].auslastung
        : null;
    const isJackpot = currentUtil !== null && currentUtil < 15;

    return (
        <>
            {error && <div className="alert alert-danger">{error}</div>}
            {isJackpot && (
                <div className="alert alert-warning d-flex align-items-center mb-3 animate__animated animate__bounce">
                    <span className="me-2">🎰</span>
                    <strong>JACKPOT!</strong>
                    <span className="ms-2">Gym is only {currentUtil?.toFixed(0)}% full right now! You're here at the perfect time!</span>
                </div>
            )}
            {gym && gymLine && <LiveStatusCard gym={gym} gymLine={gymLine} />}
            <div style={{ height: "500px" }}>
                {gym && gymLine && <ChartImpl gym={gym} gymLine={gymLine} />}
            </div>

            {hideHandles === false && (
                <div className="d-flex mt-3 ">
                    <button
                        className="btn btn-primary me-2"
                        onClick={reloadData}
                        disabled={isLoading}
                    >
                        Reload
                    </button>
                    <div className="btn-group" role="group">
                        {days.map((d, index) => (
                            <button
                                key={index}
                                type="button"
                                className={`btn btn-outline-secondary ${
                                    dayoffset === index ? "active" : ""
                                }`}
                                onClick={() => setDayoffset(index)}
                            >
                                {d}
                            </button>
                        ))}
                    </div>
                    {isLoading && <div className="spinner-border"></div>}
                </div>
            )}
        </>
    );
}

function CopyStation({ str }: { str: string }) {
    const inputRef = React.createRef<HTMLInputElement>();

    const copy = () => {
        inputRef.current?.select();
        try {
            navigator.clipboard.writeText(str);
        } catch (err) {
            console.error("Failed to copy to clipboard", err);
            document.execCommand("copy");
        }
    };

    return (
        <div className="input-group my-2">
            <input
                type="text"
                className="form-control"
                value={str}
                onClick={copy}
                ref={inputRef}
                readOnly
            />
            <button className="btn btn-outline-secondary" type="button" onClick={copy}>
                Copy
            </button>
        </div>
    );
}

function GymStuff() {
    const [embedCode, setEmbedCode] = useState<string>(EMBED_CODE("https://rwtf.dorianko.ch"));
    const [picUrl, setPicUrl] = useState<string>("https://rwtf.dorianko.ch/embed_picture.png");

    useEffect(() => {
        setEmbedCode(EMBED_CODE(window.location.origin));
        setPicUrl(`${window.location.origin}/embed_picture.png`);
    }, []);

    return (
        <div className="card mt-3">
            <div className="card-header">
                RWTH Gym Utilization (
                <a href="https://buchung.hsz.rwth-aachen.de/angebote/aktueller_zeitraum/_Auslastung.html">
                    Data source
                </a>
                ,{" "}
                <a href="https://hochschulsport.rwth-aachen.de/cms/HSZ/Sport/Sportanlagen/Sportzentrum-Koenigshuegel/~jpwb/RWTH-GYM/">
                    Opening hours
                </a>
                )
            </div>
            <div className="card-body">
                <GymPlotWithHandles />
                <div className="mt-2">
                    <hr />
                    <h4>Legend</h4>
                    <small>
                        <dl>
                            <dt>
                                <strong>Utilization</strong>:
                            </dt>
                            <dd>Number of people in the gym as reported by HSZ.</dd>
                            <dt>
                                <strong>Prediction</strong>:
                            </dt>
                            <dd>
                                Prediction of the number of people in the gym for the remainder of
                                the day, based on historical data and the current trend. Prediction
                                for the current day becomes more accurate as the day progresses and
                                more data points are available.
                            </dd>
                            <dt>
                                <strong>Historic Arrival</strong>:
                            </dt>
                            <dd>
                                Flow rate of people arriving at the gym (Unit: people per hour).
                                <br />
                                For example, you will see that there are spikes around whole hours,
                                this is because most people plan to meet up at the gym at "nice"
                                times.
                                <br />
                                This also usually coincides with the end of lectures.
                            </dd>
                            <dt>
                                <strong>x Week(s) ago</strong>:
                            </dt>
                            <dd>Data from x week(s) ago.</dd>
                        </dl>
                    </small>
                    <small>
                        This Website is <a href="https://github.com/dorian-K/rwtf">open-source</a>!
                    </small>
                    <hr />
                    <h4>Embed</h4>
                    <small>
                        Embed this chart in your Moodle dashboard with the following code:
                        <CopyStation str={embedCode} />
                    </small>
                    <small>
                        Want to write a bot? A screenshot of the graph is made every few minutes and
                        published here:
                        <CopyStation str={picUrl} />
                    </small>
                </div>
            </div>
        </div>
    );
}

function StudyStuff() {
    const api = useBackendContext();
    const [aachener, setIsAachener] = useState<boolean>();

    useEffect(() => {
        api.isAachener().then(setIsAachener);
    }, [api]);

    if (aachener === undefined) {
        return (
            <div className="container">
                <div className="spinner-border"></div>
            </div>
        );
    }
    if (aachener === false) {
        return <>Access more from within the RWTH network!</>;
    }

    const onSubmit = (e: React.SubmitEvent<HTMLFormElement>) => {
        e.preventDefault();
        const url = (e.currentTarget.querySelector("#studyUrl") as HTMLInputElement).value;
        window.open(api.getStudyUrl(url), "_blank");
    };

    return (
        <div className="card mt-3">
            <div className="card-header">Study stuff</div>
            <div className="card-body">
                <form onSubmit={onSubmit}>
                    <div className="mb-3">
                        <label htmlFor="studyUrl" className="form-label">
                            Studydrive URL
                        </label>
                        <input
                            type="text"
                            className="form-control"
                            id="studyUrl"
                            placeholder="https://www.studydrive.net/document/1234"
                        />
                    </div>
                    <button type="submit" className="btn btn-primary">
                        Download
                    </button>
                </form>
            </div>
        </div>
    );
}

export default function Home() {
    return (
        <div className="container">
            <GymStuff />
            <StudyStuff />
        </div>
    );
}
