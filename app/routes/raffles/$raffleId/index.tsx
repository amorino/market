import { Link, useLoaderData } from "@remix-run/react";
import type { LoaderFunction } from "@remix-run/server-runtime";
import Button from "~/components/Button";
import Card from "~/components/Card";
import Grid from "~/components/Grid";
import type { FullProduct } from "~/models/ecommerce-provider.server";
import type { Raffle } from "~/models/raffle.server";
import { getRaffleById } from "~/models/raffle.server";
import type { RaffleEntry } from "~/models/raffleEntry.server";
import { getRaffleEntriesByUserId } from "~/models/raffleEntry.server";
import { authenticator } from "~/services/auth.server";
import commerce from "~/services/commerce.server";

type RaffleWithMatchingProducts = Raffle & { products: FullProduct[] };

type LoaderData = {
  raffleWithMatchingProducts?: RaffleWithMatchingProducts;
  raffleEntry?: RaffleEntry;
};

export let loader: LoaderFunction = async ({ request, params }) => {
  const user = await authenticator.isAuthenticated(request, {
    failureRedirect: "/login",
  });
  const raffleId = params.raffleId as string;
  const raffle: Raffle | null = await getRaffleById(raffleId);
  const raffleEntries = await getRaffleEntriesByUserId(user.id);

  const raffleEntry = raffleEntries.find(
    (raffleEntry) =>
      raffleEntry.userId === user.id && raffleEntry.raffleId === raffleId
  );

  const matchingProducts =
    raffle &&
    (await Promise.all(
      raffle.productSlugs.map(async (productSlug) => {
        const product = await commerce.getProduct("en", productSlug);
        return product;
      })
    ));

  const raffleWithMatchingProducts = {
    ...raffle,
    products: matchingProducts,
  };

  return { raffleWithMatchingProducts, raffleEntry };
};

export default function Index() {
  const { raffleWithMatchingProducts, raffleEntry } =
    useLoaderData() as LoaderData;

  return (
    <>
      {raffleWithMatchingProducts && (
        <Grid columns={2}>
          <Card>
            <>
              <h1 className="mb-4 font-soehneBreit text-xl font-bold uppercase text-primary500">
                {raffleWithMatchingProducts.name}
              </h1>

              <img
                src={raffleWithMatchingProducts.products[0].image}
                alt={raffleWithMatchingProducts?.name}
                width="100%"
              />
            </>
          </Card>
          <Card>
            <h2 className="mb-4 text-lg">Description</h2>
            <p>{raffleWithMatchingProducts.products[0].description}</p>
          </Card>
          <Card>
            {!raffleEntry ? (
              <Link to={`/raffles/${raffleWithMatchingProducts.id}/configure`}>
                <Button color="primary">Configure</Button>
              </Link>
            ) : (
              <Button disabled>Entry Sent</Button>
            )}
          </Card>
        </Grid>
      )}
    </>
  );
}
