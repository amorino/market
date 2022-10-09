import { Link, useLoaderData } from "@remix-run/react";
import type { LoaderFunction } from "@remix-run/server-runtime";
import { redirect } from "@remix-run/server-runtime";
import clsx from "clsx";
import {
  formatDuration,
  intervalToDuration,
  isAfter,
  isBefore,
} from "date-fns";
import invariant from "tiny-invariant";
import { useMachine } from "@xstate/react";

import Button from "~/components/Button";
import { raffleStatusClasses } from "~/components/RaffleItem";
import { getDiscordProfileByUserId } from "~/models/discordProfile.server";
import type { FullProduct } from "~/models/ecommerce-provider.server";
import type { Raffle } from "~/models/raffle.server";
import { getRaffleById } from "~/models/raffle.server";
import type { RaffleEntry } from "~/models/raffleEntry.server";
import { getRaffleEntriesByUserId } from "~/models/raffleEntry.server";
import { authenticator } from "~/services/auth.server";
import commerce from "~/services/commerce.server";
import { formatDateTime } from "~/utils/date";
import type { RaffleActivityStatus } from "~/utils/raffle";
import { getRaffleActivityStatus } from "~/utils/raffle";
import durationMachine from "./durationMachine";
import { marked } from "marked";
import type { RaffleEntryStatus } from "@prisma/client";

type RaffleWithMatchingProducts = Raffle & {
  products: (FullProduct | undefined)[];
};

type LoaderData = {
  raffleWithMatchingProducts: RaffleWithMatchingProducts;
  raffleEntry?: RaffleEntry;
};

export let loader: LoaderFunction = async ({ request, params }) => {
  const user = await authenticator.isAuthenticated(request, {
    failureRedirect: "/login",
  });
  const raffleId = params.raffleId as string;
  const raffle: Raffle | null = await getRaffleById(raffleId);
  const raffleEntries = await getRaffleEntriesByUserId(user.id);

  const discordProfile = getDiscordProfileByUserId(user.id);

  if (!discordProfile) {
    return redirect("/join/discord");
  }

  if (!raffle) {
    return redirect("/raffles");
  }

  const raffleEntry = raffleEntries.find(
    (raffleEntry) =>
      raffleEntry.userId === user.id && raffleEntry.raffleId === raffleId
  );

  const matchingProducts: (FullProduct | undefined)[] = await Promise.all(
    raffle.productSlugs
      .map(async (productSlug) => {
        const product = await commerce.getProduct("en", productSlug);
        return product;
      })
      .filter(Boolean)
  );

  const raffleWithMatchingProducts: RaffleWithMatchingProducts | null = {
    ...raffle,
    products: matchingProducts,
  };

  invariant(
    raffleWithMatchingProducts,
    "no raffle with matching products found"
  );

  if (!raffleWithMatchingProducts) {
    return redirect("/raffles");
  }

  return { raffleWithMatchingProducts, raffleEntry };
};

function getRaffleStatusText(raffleEntryStatus: RaffleEntryStatus) {
  switch (raffleEntryStatus) {
    case "DRAWN":
      return `You won the raffle`;
    case "CREATED":
      return "Entry successful";
    case "ARCHIVED":
      return "You didn't win the raffle";
    case "CANCELED":
      return "Raffle cancelled";
    default:
      return "Unknown";
  }
}

export default function Index() {
  const { raffleWithMatchingProducts, raffleEntry } =
    useLoaderData() as unknown as LoaderData;

  const { startDateTime, status, endDateTime, name } =
    raffleWithMatchingProducts;

  const [state] = useMachine(durationMachine, {
    context: {
      startDateTime,
      timeUntilRaffle: formatDuration(
        intervalToDuration({
          start: new Date(),
          end: new Date(startDateTime),
        })
      ),
    },
  });

  const { timeUntilRaffle } = state.context;

  function getRaffleActivitySubtitle(
    raffleActivityStatus: RaffleActivityStatus
  ) {
    switch (raffleActivityStatus) {
      case "UPCOMING":
        return timeUntilRaffle;
      case "ACTIVE":
        return "Live now";
      case "PAST":
        return "Completed";
      default:
        return "Unknown";
    }
  }

  const raffleActivityStatus = getRaffleActivityStatus(
    startDateTime.toString(),
    endDateTime.toString(),
    new Date().toISOString()
  );

  const firstRaffleProduct = raffleWithMatchingProducts.products[0];

  if (!firstRaffleProduct) {
    return redirect("/raffles");
  }

  const { metafields } = firstRaffleProduct;

  const detailsMetafields = metafields.filter(
    (metafield) => metafield.namespace === "details"
  );

  const componentsMetafield = detailsMetafields.find(
    (metafield) => metafield.key === "components"
  );
  const accessoriesMetafield = detailsMetafields.find(
    (metafield) => metafield.key === "accessories"
  );

  const currentDateTime = new Date();

  const canEnterRaffle =
    isBefore(currentDateTime, new Date(startDateTime)) ||
    isAfter(currentDateTime, new Date(endDateTime));

  return (
    <>
      <>
        {firstRaffleProduct ? (
          <div className="grid-cols-3 gap-8 md:grid">
            <div className="col-span-2">
              <div className="flex flex-col">
                <div className="flex items-center gap-4 md:basis-2/3">
                  <h1 className="mb-4 font-soehneBreit text-2xl text-primary-500">
                    {name}
                  </h1>
                  <span
                    className={clsx(
                      raffleStatusClasses.base,
                      status && raffleStatusClasses.status[raffleActivityStatus]
                    )}
                  >
                    {raffleActivityStatus}
                  </span>
                </div>

                <div>
                  <div>
                    <p className="mb-2 text-xl">
                      {formatDateTime(startDateTime)}–
                      {formatDateTime(endDateTime)}{" "}
                    </p>
                  </div>
                  <div className="mb-6 text-sm text-neutral-700">
                    {getRaffleActivitySubtitle(raffleActivityStatus)}
                  </div>
                </div>
              </div>
              <img
                src={firstRaffleProduct.image}
                alt={raffleWithMatchingProducts?.name}
                width="100%"
              />
            </div>
            <div className="col-span-1 flex flex-col">
              {!raffleEntry ? (
                <div className="mb-4 rounded-md bg-yellow-100 p-4">
                  <Link
                    to={`/raffles/${raffleWithMatchingProducts.id}/configure`}
                  >
                    <Button
                      color={canEnterRaffle ? "disabled" : "primary"}
                      size="large"
                      disabled={canEnterRaffle}
                      className="w-full"
                    >
                      {getRaffleActivitySubtitle(raffleActivityStatus)}
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="mb-4 rounded-md bg-yellow-100 p-4">
                  Entry successful!{" "}
                  <div className="text-yellow-700">
                    Sent on {formatDateTime(raffleEntry.createdAt)}
                  </div>
                  <div className="text-yellow-700">
                    Status: {getRaffleStatusText(raffleEntry.status)}
                  </div>
                </div>
              )}
              <div>
                <p className="mb-6 text-2xl">
                  {firstRaffleProduct.formattedPrice}
                </p>
                {componentsMetafield ? (
                  <div
                    dangerouslySetInnerHTML={{
                      __html: marked.parse(componentsMetafield?.value),
                    }}
                    className="prose prose-brand"
                  />
                ) : null}
                {accessoriesMetafield ? (
                  <div
                    dangerouslySetInnerHTML={{
                      __html: marked.parse(accessoriesMetafield?.value),
                    }}
                    className="prose prose-brand"
                  />
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </>
    </>
  );
}
